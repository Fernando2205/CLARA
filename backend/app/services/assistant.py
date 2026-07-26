from __future__ import annotations

import asyncio
import logging
import re
from typing import Literal

from openai import AsyncOpenAI

from ..config import get_settings
from ..models import AssistantAnalysis
from .gpt import has_multiple_product_mentions, local_extract
from .matcher import lexical_coverage, normalize_text

logger = logging.getLogger(__name__)


ASSISTANT_PROMPT = """Eres el motor de razonamiento de CLARA, asistente de inventarios de
cocinas de Colsubsidio (Colombia). Recibes una frase hablada por un operario durante
una toma física de inventario — a veces limpia, a veces con relleno conversacional
("pues", "o sea", "en ese momento", "ahorita"), correcciones a mitad de frase, o
varios productos mencionados juntos. Tu trabajo es entender la intención real, no
solo reconocer palabras clave.

Clasifica la intención:
- registrar: afirma una cantidad física de un producto.
- consultar_existencia: pregunta si hay o cuánto hay de un producto.
- listar_inventario: pide ver el inventario, catálogo o todo lo disponible.
- corregir: corrige el último conteo ("perdón, son...", "no, eran...", "me equivoqué").
- explicar_alerta: pregunta por qué CLARA duda o por qué muestra una alerta.
- ayuda: pregunta cómo usar CLARA o qué puede hacer.
- saludo: saludo breve sin solicitud de inventario.
- desconocido: cualquier otra solicitud fuera del inventario.

Reglas para producto_texto, cantidad, unidad, estado:
- producto_texto: el nombre del producto tal como lo dijo, SIN relleno ni
  muletillas. No lo traduzcas a otro nombre, no elijas un SKU y no inventes
  palabras que el usuario no dijo. null si la frase no menciona un producto.
- cantidad: número. Convierte palabras a número ("nueve"→9, "treinta y
  cinco"→35, "media"→0.5, "docena"→12). null si no la dijo (NO inventes).
- unidad: la unidad que dijo (cajas, bolsas, kilos, litros, unidades,
  porciones, etc.) o null si no la dijo.
- Si la frase menciona VARIOS productos distintos (p. ej. "tengo 2 litros de
  aceite, tengo 5 kilos de arroz"), identifica y devuelve SOLO el PRIMERO
  que mencionó, con su cantidad y unidad correctas — no los mezcles ni
  inventes un nombre combinado.
- productos_adicionales: cuántos productos MÁS, aparte del primero, mencionó
  en la misma frase (0 si solo mencionó uno o ninguno).

No inventes existencias, productos, cantidades ni recomendaciones. Nunca
respondas la pregunta del usuario: el servidor consultará los datos reales."""

QUERY_WORDS = {
    "tenemos", "tienen", "hay", "queda", "quedan", "cuanto", "cuanta",
    "cuantos", "cuantas", "disponible", "disponibles", "existencia",
    "existencias", "stock", "inventario", "sistema", "segun", "me", "dices",
    "puedes", "decir", "de", "del", "en", "la", "el", "los", "las", "que",
    "aqui", "aca", "alli", "alla", "ahi", "ya", "pues", "osea", "oye",
    "mira", "sabes", "sabe", "disculpa", "disculpe", "vale", "tipo",
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
    # Respaldo cuando no hay OPENAI_API_KEY o GPT falla/hace timeout — ya
    # no es el camino principal (ver `analyze_phrase`), solo la red de
    # seguridad para que la app nunca se quede sin responder nada.
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
    # El parser local es determinístico y, para frases bien formadas de un
    # solo producto, más confiable que GPT (probado: GPT-4o-mini clasifica
    # mal ~1 de cada 3 veces incluso frases de manual como "quedan nueve
    # cajas de harina pan"). Solo forzamos el razonamiento de GPT cuando hay
    # una señal concreta de que la frase es más compleja de lo que las
    # reglas pueden resolver bien (varios productos en una misma frase) o
    # cuando el parser local no entendió nada en absoluto.
    needs_reasoning = local.intencion == "desconocido" or has_multiple_product_mentions(phrase)
    if not needs_reasoning:
        logger.info("analyze_phrase: analisis local resolvio la intencion (%s), no se llamo a GPT", local.intencion)
        return local, "local"

    settings = get_settings()
    if not settings.openai_api_key:
        logger.info("analyze_phrase: OPENAI_API_KEY no configurada, se usa el analisis local")
        return local, "local"

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=3.8, max_retries=0)
    try:
        response = await asyncio.wait_for(
            client.responses.parse(
                model=settings.openai_model,
                temperature=0,
                input=[
                    {"role": "system", "content": ASSISTANT_PROMPT},
                    {"role": "user", "content": phrase},
                ],
                text_format=AssistantAnalysis,
            ),
            timeout=4.0,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ValueError("Análisis vacío")
        grounded_product = (
            parsed.producto_texto
            if parsed.producto_texto and lexical_coverage(parsed.producto_texto, phrase) >= 0.8
            else local.producto_texto
        )
        return AssistantAnalysis(
            intencion=parsed.intencion,
            producto_texto=grounded_product,
            cantidad=parsed.cantidad,
            unidad=parsed.unidad,
            estado_producto=parsed.estado_producto,
            productos_adicionales=max(parsed.productos_adicionales, 0),
        ), "openai"
    except Exception as error:
        logger.warning(
            "analyze_phrase: GPT fallo (%s: %s), se usa el analisis local",
            type(error).__name__, error,
        )
        return local, "local"
