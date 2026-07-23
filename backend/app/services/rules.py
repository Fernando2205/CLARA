from __future__ import annotations

import sqlite3

from ..models import AlertAction, AlertOut


UNIT_CONVERSION = {
    "kilos": ("Kilogram", 1),
    "gramos": ("Kilogram", 0.001),
    "litros": ("Liter", 1),
    "porciones": ("Portion", 1),
    "unidades": ("Unidad", 1),
    "cajas": ("Unidad", 1),
    "bolsas": ("Unidad", 1),
    "paquetes": ("Unidad", 1),
    "botellas": ("Unidad", 1),
}


def evaluate_rules(
    connection: sqlite3.Connection,
    article: sqlite3.Row,
    quantity: float | None,
    spoken_unit: str | None,
    session_id: str | None,
    confidence: float,
) -> list[AlertOut]:
    alerts: list[AlertOut] = []
    converted_unit = UNIT_CONVERSION.get(spoken_unit or "", (None, 1))[0]

    if converted_unit and converted_unit != article["unidad"]:
        alerts.append(AlertOut(
            regla="V2", nivel="error",
            mensaje=(
                f"Dijiste {spoken_unit}; {article['articulo']} se controla en "
                f"{article['unidad']}. ¿Quisiste decir {quantity} {article['unidad']}?"
            ),
            razon="La unidad dictada no coincide con la unidad definida en el catálogo.",
            recomendacion="Usa la unidad del catálogo o cancela para dictar el conteo de nuevo.",
            acciones=[
                AlertAction(label=f"Usar {article['unidad']}", valor="usar_unidad_catalogo"),
                AlertAction(label="Cancelar", valor="cancelar"),
            ],
        ))

    if article["unidad"] == "Unidad" and quantity is not None and quantity % 1 != 0:
        alerts.append(AlertOut(
            regla="V6", nivel="error",
            mensaje=f"{article['articulo']} se cuenta por unidades enteras.",
            razon="Este artículo no admite cantidades fraccionadas.",
            recomendacion="Revisa el conteo y utiliza un número entero.",
            acciones=[AlertAction(label="Redondear cantidad", valor="redondear")],
        ))

    ambiguous_unit = spoken_unit is None and article["unidad"] == "Unidad"
    if quantity is None or ambiguous_unit or confidence < 0.6:
        message = (
            f"¿{quantity} qué? — cajas, bolsas o unidades"
            if ambiguous_unit
            else "¿Será alguno de estos?"
            if confidence < 0.6
            else f"¿{article['articulo']} cuánto?"
        )
        alerts.append(AlertOut(
            regla="V3", nivel="warn", mensaje=message,
            razon="Falta un dato o la coincidencia del producto no es suficientemente segura.",
            recomendacion="Confirma el producto, la cantidad y la unidad antes de guardar.",
            acciones=[AlertAction(label="Confirmar datos", valor="confirmar")],
        ))

    previous = None
    if session_id:
        previous = connection.execute(
            """
            SELECT cantidad_fisica, unidad FROM registros
            WHERE sesion_id = ? AND articulo_id = ?
            ORDER BY id DESC LIMIT 1
            """,
            (session_id, article["id"]),
        ).fetchone()
    if previous:
        alerts.append(AlertOut(
            regla="V5", nivel="warn",
            mensaje=(
                f"Ya registraste {article['articulo']} "
                f"({previous['cantidad_fisica']} {previous['unidad']}). "
                "¿Corrección o segundo estante (suma)?"
            ),
            razon="El mismo artículo ya tiene un conteo dentro de esta sesión.",
            recomendacion="Elige reemplazar si era una corrección o sumar si contaste otro lugar.",
            acciones=[
                AlertAction(label="Reemplazar", valor="reemplazar"),
                AlertAction(label="Sumar", valor="sumar"),
                AlertAction(label="Cancelar", valor="cancelar"),
            ],
        ))

    if spoken_unit in {"cajas", "bolsas", "paquetes"}:
        alerts.append(AlertOut(
            regla="V7", nivel="warn",
            mensaje=f"Capturaste por {spoken_unit}: ¿cuántas unidades trae cada una?",
            razon="El catálogo controla este producto por unidades, no por empaques.",
            recomendacion="Indica cuántas unidades contiene cada empaque para convertir el total.",
            acciones=[AlertAction(label="Indicar factor", valor="factor_empaque")],
        ))

    hist_min, hist_max = article["hist_min"], article["hist_max"]
    stock = article["stock_sistema"]
    if (
        hist_min is not None and quantity is not None
        and (quantity < hist_min * 0.5 or quantity > hist_max * 2)
        and abs(quantity - stock) > 15
    ):
        alerts.append(AlertOut(
            regla="V1", nivel="warn",
            mensaje=(
                f"¿Segura que son {quantity:g}? Aquí suele haber entre "
                f"{hist_min:.0f} y {hist_max:.0f}."
            ),
            razon=(
                f"El conteo se aleja del rango histórico de {hist_min:.0f} "
                f"a {hist_max:.0f} y del saldo del sistema."
            ),
            recomendacion="Haz una segunda comprobación antes de confirmar la cantidad.",
            acciones=[
                AlertAction(label=f"Sí, son {quantity:g}", valor=quantity),
                AlertAction(label="No, corregir", valor=None),
            ],
        ))

    if stock < 0:
        alerts.append(AlertOut(
            regla="V4", nivel="info",
            mensaje=(
                f"El sistema muestra {stock:g}. Tu conteo de {quantity} "
                "lo corrige de raíz."
            ),
            razon="El saldo del sistema es negativo y requiere saneamiento.",
            recomendacion="Confirma el conteo físico para dejar evidencia de la diferencia.",
            acciones=[AlertAction(label="Entendido", valor="entendido")],
        ))

    return alerts
