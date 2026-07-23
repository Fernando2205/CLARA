from __future__ import annotations

import asyncio
import re
from typing import Literal

from openai import AsyncOpenAI

from ..config import get_settings
from ..models import RawExtraction
from .matcher import lexical_coverage, normalize_text


SYSTEM_PROMPT = """Eres el motor de extracción de CLARA, asistente de inventarios de cocinas de Colsubsidio (Colombia).
Recibes una frase dictada por un operario durante una toma física de inventario.
Devuelve SOLO el JSON del esquema. Reglas:
- "producto_texto": el nombre del producto tal como lo dijo, limpio de muletillas. NO lo cambies por un nombre de catálogo.
- "cantidad": número. Convierte palabras a número ("nueve"→9, "treinta y cinco"→35, "media"→0.5, "docena"→12, "una arroba"→12.5 con unidad kg, "una libra"→0.5 con unidad kg).
- "unidad": una de: unidades|cajas|bolsas|paquetes|botellas|kilos|gramos|litros|porciones|null. "gramos" NO se convierte a kilos: repórtalo como gramos.
- "estado_producto": si menciona condición ("buen estado", "vencido", "averiado"), captúrala; si no, null.
- "es_correccion": true SOLO si la frase corrige lo anterior ("perdón...", "no, eran...", "me equivoqué", "corrige").
- "cantidad" o "unidad" ausentes en la frase → null (NO inventes).
Frases fuera de dominio (no son inventario) → producto_texto null."""

SMALL_NUMBERS = {
    "cero": 0, "un": 1, "una": 1, "uno": 1, "dos": 2, "tres": 3,
    "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8,
    "nueve": 9, "diez": 10, "once": 11, "doce": 12, "trece": 13,
    "catorce": 14, "quince": 15, "dieciseis": 16, "diecisiete": 17,
    "dieciocho": 18, "diecinueve": 19, "veinte": 20, "veintiuno": 21,
    "veintidos": 22, "veintitres": 23, "veinticuatro": 24,
    "veinticinco": 25, "veintiseis": 26, "veintisiete": 27,
    "veintiocho": 28, "veintinueve": 29,
}
TENS = {
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90, "cien": 100,
}
UNITS: dict[str, Literal[
    "unidades", "cajas", "bolsas", "paquetes", "botellas",
    "kilos", "gramos", "litros", "porciones"
]] = {
    "unidad": "unidades", "unidades": "unidades", "caja": "cajas", "cajas": "cajas",
    "bolsa": "bolsas", "bolsas": "bolsas", "paquete": "paquetes",
    "paquetes": "paquetes", "botella": "botellas", "botellas": "botellas",
    "kilo": "kilos", "kilos": "kilos", "kilogramo": "kilos",
    "kilogramos": "kilos", "gramo": "gramos", "gramos": "gramos",
    "litro": "litros", "litros": "litros", "porcion": "porciones",
    "porciones": "porciones", "lt": "litros", "lts": "litros",
    "kg": "kilos", "kgs": "kilos", "gr": "gramos",
    "boteya": "botellas", "boteyas": "botellas",
}
STOP_WORDS = {
    "quedan", "queda", "hay", "contamos", "conte", "tenemos", "tengo", "en",
    "son", "eran", "es", "a", "de", "del", "el", "la", "los", "las", "y",
    "medio", "media", "buen", "bueno", "estado", "vencido", "vencida",
    "averiado", "averiada", "no", "perdon", "corrige", "me", "equivoque",
    "agrega", "agregar", "agregue", "anada", "anade", "anadir", "anota",
    "anote", "anotar", "apunta", "apunte", "apuntar", "ingresa", "ingrese",
    "ingresar", "registra", "registre", "registrar", "pon", "ponga", "poner",
    "suma", "sume", "sumar", "marca", "marque", "marcar", "quiero",
    "necesito", "puede", "puedes", "podria", "podrias", "podemos",
    "ayuda", "ayudas", "ayudar", "quieres", "por", "favor", "porfa",
    "arroba", "libra", "docena", *UNITS.keys(), *SMALL_NUMBERS.keys(), *TENS.keys(),
}


def _local_quantity(text: str) -> float | None:
    if "no hay" in text:
        return 0
    if "media arroba" in text:
        return 6.25
    if "una arroba" in text or "un arroba" in text:
        return 12.5
    if "una libra" in text or "un libra" in text:
        return 0.5
    match = re.search(r"\d+(?:[.,]\d+)?", text)
    if match:
        return float(match.group().replace(",", "."))
    tokens = text.split()
    for index, token in enumerate(tokens):
        if token == "docena":
            return 12
        if token in TENS:
            offset = 2 if index + 1 < len(tokens) and tokens[index + 1] == "y" else 1
            next_value = SMALL_NUMBERS.get(tokens[index + offset], 0) if index + offset < len(tokens) else 0
            value = TENS[token] + next_value
            return value + 0.5 if "y medio" in text else value
        if token in SMALL_NUMBERS:
            value = float(SMALL_NUMBERS[token])
            return value + 0.5 if "y medio" in text else value
    return None


def local_extract(phrase: str) -> RawExtraction:
    text = normalize_text(phrase)
    correction = bool(re.search(r"\b(perdon|corrige|eran|me equivoque|quise decir)\b", text))
    unit = None
    if "arroba" in text or "libra" in text:
        unit = "kilos"
    elif "huevo" in text:
        unit = "unidades"
    else:
        for token in text.split():
            if token in UNITS:
                unit = UNITS[token]
                break
    state = (
        "buen estado" if "buen estado" in text
        else "vencido" if "vencid" in text
        else "averiado" if "averiad" in text
        else None
    )
    product_tokens = [
        token for token in text.split()
        if token not in STOP_WORDS and not re.fullmatch(r"\d+(?:[.,]\d+)?", token)
    ]
    product = " ".join(product_tokens).strip() or None
    if correction:
        product = None
    if text in {"hola", "hola como estas", "como estas"}:
        product = None
    return RawExtraction(
        producto_texto=product,
        cantidad=_local_quantity(text),
        unidad=unit,
        estado_producto=state,
        es_correccion=correction,
    )


async def extract_entities(phrase: str) -> tuple[RawExtraction, Literal["openai", "local"]]:
    local = local_extract(phrase)
    if (
        local.es_correccion
        or (
            local.producto_texto
            and local.cantidad is not None
            and local.unidad is not None
        )
    ):
        return local, "local"

    settings = get_settings()
    if not settings.openai_api_key:
        return local, "local"

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=2.15, max_retries=0)
    try:
        response = await asyncio.wait_for(
            client.responses.parse(
                model=settings.openai_model,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": phrase},
                ],
                text_format=RawExtraction,
            ),
            timeout=2.3,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ValueError("OpenAI no devolvió una extracción estructurada")
        grounded_product = (
            local.producto_texto
            or (
                parsed.producto_texto
                if parsed.producto_texto
                and lexical_coverage(parsed.producto_texto, phrase) >= 0.8
                else None
            )
        )
        return RawExtraction(
            producto_texto=grounded_product,
            cantidad=parsed.cantidad if parsed.cantidad is not None else local.cantidad,
            unidad=parsed.unidad or local.unidad,
            estado_producto=parsed.estado_producto or local.estado_producto,
            es_correccion=parsed.es_correccion or local.es_correccion,
        ), "openai"
    except Exception:
        # El demo nunca se interrumpe por red, cuota o una respuesta inválida.
        return local_extract(phrase), "local"
