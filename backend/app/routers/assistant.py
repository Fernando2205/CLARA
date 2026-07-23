from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..models import (
    AssistantRequest, AssistantResponse, ExtractRequest, RawExtraction,
)
from ..services.assistant import analyze_phrase, refine_failed_capture
from ..services.extraction import resolve_extraction
from ..services.inventory import get_inventory, get_inventory_item
from ..services.matcher import match_catalog

router = APIRouter(tags=["asistente"])

UNIT_LABELS = {
    "Unidad": "unidades",
    "Kilogram": "kilogramos",
    "Liter": "litros",
    "Portion": "porciones",
}


def natural_number(value: float) -> str:
    if float(value).is_integer():
        return f"{int(value):,}".replace(",", ".")
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".").rstrip("0").rstrip(",")


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(
    request: AssistantRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> AssistantResponse:
    analysis, origin = await analyze_phrase(request.frase)

    if analysis.intencion in {"registrar", "corregir"}:
        raw = RawExtraction(
            producto_texto=analysis.producto_texto,
            cantidad=analysis.cantidad,
            unidad=analysis.unidad,
            estado_producto=analysis.estado_producto,
            es_correccion=analysis.intencion == "corregir",
        )
        extract_request = ExtractRequest(
            frase=request.frase,
            bodega=request.bodega,
            sesion_id=request.sesion_id,
            contexto_ultimo_sku=request.contexto_ultimo_sku,
        )
        extraction = resolve_extraction(connection, extract_request, raw, origin)
        if extraction.tipo == "no_match":
            refined = await refine_failed_capture(request.frase, analysis)
            if refined and refined.producto_texto != analysis.producto_texto:
                refined_raw = RawExtraction(
                    producto_texto=refined.producto_texto,
                    cantidad=refined.cantidad,
                    unidad=refined.unidad,
                    estado_producto=refined.estado_producto,
                    es_correccion=refined.intencion == "corregir",
                )
                refined_extraction = resolve_extraction(
                    connection, extract_request, refined_raw, "openai"
                )
                if refined_extraction.articulo is not None:
                    analysis = refined
                    extraction = refined_extraction
                    origin = "openai"
        if extraction.tipo == "no_match":
            message = f"Sin coincidencia · {analysis.producto_texto or 'Producto no identificado'}"
            spoken_message = (
                f"No encontré {analysis.producto_texto or 'ese producto'} en esta bodega. "
                "Prueba con un nombre más corto."
            )
        elif extraction.requiere_seleccion and extraction.articulo:
            option_count = 1 + len(extraction.alternativas)
            message = f"Elige una variante · {option_count} coincidencias"
            spoken_message = (
                f"Encontré {option_count} opciones de "
                f"{analysis.producto_texto or extraction.articulo.nombre.lower()}. "
                "Elige la presentación correcta."
            )
        elif extraction.tipo == "correccion" and extraction.articulo:
            unit = extraction.unidad_dicha or UNIT_LABELS.get(
                extraction.articulo.unidad, extraction.articulo.unidad
            )
            quantity = natural_number(extraction.cantidad or 0)
            message = f"Corrección preparada · {extraction.articulo.nombre} · {quantity} {unit}"
            spoken_message = (
                f"Cambiaré {extraction.articulo.nombre.lower()} a "
                f"{quantity} {unit}. Confirma si es correcto."
            )
        elif extraction.articulo:
            missing = []
            if extraction.cantidad is None:
                missing.append("la cantidad")
            if extraction.unidad_dicha is None:
                missing.append("la unidad")
            if missing:
                message = f"Falta completar · {extraction.articulo.nombre}"
                spoken_message = (
                    f"Identifiqué {extraction.articulo.nombre.lower()}, pero falta "
                    f"{' y '.join(missing)}."
                )
            else:
                quantity = natural_number(extraction.cantidad or 0)
                message = (
                    f"Conteo preparado · {extraction.articulo.nombre} · "
                    f"{quantity} {extraction.unidad_dicha}"
                )
                spoken_message = (
                    f"Registré {quantity} {extraction.unidad_dicha} de "
                    f"{extraction.articulo.nombre.lower()}. Confirma el dato."
                )
        else:
            message = "No pude preparar el conteo"
            spoken_message = (
                "Me faltan datos. Di la cantidad, la unidad y el producto."
            )
        return AssistantResponse(
            intencion=analysis.intencion,
            mensaje=message,
            mensaje_hablado=spoken_message,
            accion_ui="mostrar_tarjeta",
            extraccion=extraction,
            origen=origin,
        )

    if analysis.intencion == "consultar_existencia":
        if not analysis.producto_texto:
            return AssistantResponse(
                intencion="consultar_existencia",
                mensaje="Indica el producto que quieres consultar",
                mensaje_hablado=(
                    "Dime qué producto quieres consultar."
                ),
                origen=origin,
            )
        matched = match_catalog(connection, analysis.producto_texto, request.bodega)
        if matched.article is None or matched.article["bodega"] != request.bodega:
            return AssistantResponse(
                intencion="consultar_existencia",
                mensaje=f"Sin resultados · {analysis.producto_texto}",
                mensaje_hablado=(
                    f"No encuentro {analysis.producto_texto} en esta bodega. "
                    "Prueba con un nombre más corto."
                ),
                origen=origin,
            )
        item = get_inventory_item(connection, matched.article["id"], request.sesion_id)
        if item is None:
            return AssistantResponse(
                intencion="consultar_existencia",
                mensaje="Consulta no disponible",
                mensaje_hablado=(
                    "No pude consultar ese producto. Inténtalo de nuevo."
                ),
                origen=origin,
            )
        unit = UNIT_LABELS.get(item.unidad, item.unidad).lower()
        quantity = natural_number(item.cantidad_actual)
        if item.contado_en_sesion:
            message = f"{item.nombre} · {quantity} {unit} · conteo físico"
            spoken_message = (
                f"Ya contamos {quantity} {unit} de {item.nombre.lower()}. "
                f"El sistema mostraba {natural_number(item.stock_sistema)}."
            )
        elif item.cantidad_actual > 0:
            message = f"{item.nombre} · {quantity} {unit} disponibles"
            spoken_message = (
                f"Sí tenemos {item.nombre.lower()}. El sistema registra {quantity} "
                f"{unit}, todavía sin conteo físico."
            )
        elif item.cantidad_actual == 0:
            message = f"{item.nombre} · sin existencias registradas"
            spoken_message = (
                f"{item.nombre} aparece en el catálogo, pero su saldo es cero. "
                "Conviene revisarlo físicamente."
            )
        else:
            message = f"{item.nombre} · saldo inconsistente ({quantity} {unit})"
            spoken_message = (
                f"{item.nombre} tiene un saldo negativo de {quantity} {unit}. "
                "Necesita verificación física."
            )
        return AssistantResponse(
            intencion="consultar_existencia",
            mensaje=message,
            mensaje_hablado=spoken_message,
            coincidencias=[item],
            origen=origin,
        )

    if analysis.intencion == "listar_inventario":
        inventory = get_inventory(connection, request.bodega, request.sesion_id)
        summary = inventory.resumen
        message = f"Inventario abierto · {summary.total} referencias"
        spoken_message = (
            f"Abrí {summary.total} referencias: {summary.con_existencias} con existencias "
            f"y {summary.sin_existencias + summary.saldo_negativo} por revisar."
        )
        return AssistantResponse(
            intencion="listar_inventario",
            mensaje=message,
            mensaje_hablado=spoken_message,
            accion_ui="mostrar_inventario",
            inventario=summary,
            origen=origin,
        )

    if analysis.intencion == "explicar_alerta":
        if request.contexto_alerta:
            message = "Explicación de la alerta"
            spoken_message = request.contexto_alerta
        else:
            message = "No hay alertas pendientes"
            spoken_message = (
                "No hay alertas pendientes en este momento."
            )
        return AssistantResponse(
            intencion="explicar_alerta",
            mensaje=message,
            mensaje_hablado=spoken_message,
            origen=origin,
        )

    if analysis.intencion == "ayuda":
        return AssistantResponse(
            intencion="ayuda",
            mensaje="Puedo contar, consultar, corregir y explicar alertas",
            mensaje_hablado=(
                "Puedo contar, consultar productos, corregir registros y explicar alertas."
            ),
            origen=origin,
        )

    if analysis.intencion == "saludo":
        return AssistantResponse(
            intencion="saludo",
            mensaje="CLARA lista para esta toma",
            mensaje_hablado=(
                "Hola. Puedes dictarme un conteo o consultar un producto."
            ),
            origen=origin,
        )

    return AssistantResponse(
        intencion="desconocido",
        mensaje="No identifiqué la solicitud",
        mensaje_hablado=(
            "No entendí la solicitud. Intenta con un conteo o una consulta de producto."
        ),
        origen=origin,
    )
