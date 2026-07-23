from __future__ import annotations

import asyncio
import re
from typing import Literal

from openai import AsyncOpenAI

from ..config import get_settings
from ..models import AssistantAnalysis
from .gpt import local_extract
from .matcher import lexical_coverage, normalize_text


ASSISTANT_PROMPT = """Eres el clasificador conversacional de CLARA, asistente de inventarios.
Clasifica la intención de una frase hablada por un operario:
- registrar: afirma una cantidad física de un producto.
- consultar_existencia: pregunta si hay o cuánto hay de un producto.
- listar_inventario: pide ver el inventario, catálogo o todo lo disponible.
- corregir: corrige el último conteo.
- explicar_alerta: pregunta por qué CLARA duda o por qué muestra una alerta.
- ayuda: pregunta cómo usar CLARA o qué puede hacer.
- saludo: saludo breve sin solicitud de inventario.
- desconocido: cualquier otra solicitud fuera del inventario.

Extrae producto_texto, cantidad, unidad y estado solo cuando aparezcan. No inventes
existencias, productos, cantidades ni recomendaciones. Nunca respondas la pregunta:
el servidor consultará los datos reales."""

REFINEMENT_PROMPT = """Limpia una frase de captura de inventario que no coincidió
con el catálogo. Devuelve el esquema solicitado.
- producto_texto: conserva únicamente el nombre del producto expresado por el usuario.
- Elimina peticiones y muletillas como "puedes", "quiero", "agrega", "por favor".
- No traduzcas el producto a otro nombre, no elijas un SKU y no inventes palabras.
- Conserva cantidad, unidad y estado cuando estén presentes.
- La intención debe ser registrar o corregir."""

QUERY_WORDS = {
    "tenemos", "tienen", "hay", "queda", "quedan", "cuanto", "cuanta",
    "cuantos", "cuantas", "disponible", "disponibles", "existencia",
    "existencias", "stock", "inventario", "sistema", "segun", "me", "dices",
    "puedes", "decir", "de", "del", "en", "la", "el", "los", "las", "que",
}


def _query_product(phrase: str) -> str | None:
    extracted = local_extract(phrase)
    if extracted.producto_texto:
        tokens = [
            token for token in normalize_text(extracted.producto_texto).split()
            if token not in QUERY_WORDS
        ]
        if tokens:
            return " ".join(tokens)
    tokens = [
        token for token in normalize_text(phrase).split()
        if token not in QUERY_WORDS
    ]
    return " ".join(tokens) or None


def local_assistant_analysis(phrase: str) -> AssistantAnalysis:
    text = normalize_text(phrase)
    extracted = local_extract(phrase)

    if re.search(r"\b(perdon|corrige|corregir|eran|me equivoque|quise decir)\b", text):
        intent = "corregir"
    elif re.search(r"\b(por que|explica|explicame|por que dudas|por que segura)\b", text):
        intent = "explicar_alerta"
    elif (
        re.search(r"\b(muestra|muestrame|ver|abre|abrir|lista|listar)\b.*\b(inventario|catalogo|existencias)\b", text)
        or text in {"que tenemos", "que hay", "todo el inventario", "inventario completo"}
    ):
        intent = "listar_inventario"
    elif (
        re.search(r"\b(tenemos|tienen|hay|queda|quedan|existencias|stock|disponible)\b", text)
        and extracted.cantidad is None
    ):
        intent = "consultar_existencia"
    elif re.search(r"\b(ayuda|como funciona|como uso|que puedes hacer|que hago)\b", text):
        intent = "ayuda"
    elif text in {"hola", "buenos dias", "buenas tardes", "buenas", "como estas"}:
        intent = "saludo"
    elif extracted.es_correccion:
        intent = "corregir"
    elif extracted.producto_texto and extracted.cantidad is not None:
        intent = "registrar"
    elif extracted.producto_texto:
        intent = "registrar"
    else:
        intent = "desconocido"

    product = (
        _query_product(phrase)
        if intent == "consultar_existencia"
        else extracted.producto_texto
    )
    return AssistantAnalysis(
        intencion=intent,
        producto_texto=product,
        cantidad=extracted.cantidad,
        unidad=extracted.unidad,
        estado_producto=extracted.estado_producto,
    )


async def analyze_phrase(
    phrase: str,
) -> tuple[AssistantAnalysis, Literal["openai", "local"]]:
    local = local_assistant_analysis(phrase)
    if local.intencion != "desconocido":
        return local, "local"

    settings = get_settings()
    if not settings.openai_api_key:
        return local, "local"

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=2.2, max_retries=0)
    try:
        response = await asyncio.wait_for(
            client.responses.parse(
                model=settings.openai_model,
                input=[
                    {"role": "system", "content": ASSISTANT_PROMPT},
                    {"role": "user", "content": phrase},
                ],
                text_format=AssistantAnalysis,
            ),
            timeout=2.4,
        )
        if response.output_parsed is None:
            raise ValueError("Clasificación vacía")
        parsed = response.output_parsed
        grounded_product = (
            local.producto_texto
            or (
                parsed.producto_texto
                if parsed.producto_texto
                and lexical_coverage(parsed.producto_texto, phrase) >= 0.8
                else None
            )
        )
        return AssistantAnalysis(
            intencion=(
                local.intencion
                if local.intencion != "desconocido"
                else parsed.intencion
            ),
            producto_texto=grounded_product,
            cantidad=parsed.cantidad if parsed.cantidad is not None else local.cantidad,
            unidad=parsed.unidad or local.unidad,
            estado_producto=parsed.estado_producto or local.estado_producto,
        ), "openai"
    except Exception:
        return local_assistant_analysis(phrase), "local"


async def refine_failed_capture(
    phrase: str,
    baseline: AssistantAnalysis,
) -> AssistantAnalysis | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=3, max_retries=0)
    try:
        response = await asyncio.wait_for(
            client.responses.parse(
                model=settings.openai_model,
                input=[
                    {"role": "system", "content": REFINEMENT_PROMPT},
                    {"role": "user", "content": phrase},
                ],
                text_format=AssistantAnalysis,
            ),
            timeout=3.2,
        )
        parsed = response.output_parsed
        if (
            parsed is None
            or not parsed.producto_texto
            or lexical_coverage(parsed.producto_texto, phrase) < 0.8
        ):
            return None
        return AssistantAnalysis(
            intencion=(
                "corregir" if baseline.intencion == "corregir" else "registrar"
            ),
            producto_texto=parsed.producto_texto,
            cantidad=(
                baseline.cantidad
                if baseline.cantidad is not None
                else parsed.cantidad
            ),
            unidad=baseline.unidad or parsed.unidad,
            estado_producto=baseline.estado_producto or parsed.estado_producto,
        )
    except Exception:
        return None
