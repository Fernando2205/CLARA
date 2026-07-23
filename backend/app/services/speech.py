from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unicodedata
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..config import get_settings


VOICE_CACHE_VERSION = "v4-natural-tts"
FORBIDDEN_PREAMBLES = (
    "claro",
    "por supuesto",
    "aqui esta",
    "aqui tienes",
    "el mensaje dice",
    "voy a leer",
)
VOICE_INSTRUCTIONS = """Eres la voz de CLARA, asistente de inventarios de cocina.
Habla en español colombiano neutro, con una voz cálida, cercana y profesional.
Usa un ritmo ágil y conversacional, con pausas naturales muy breves. Pronuncia
cantidades, productos y unidades con claridad. Evita sonar como una locución,
un sistema automático o una lectura literal. Empieza directamente con la primera
palabra del texto y no agregues, quites ni cambies información."""


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


def _has_forbidden_preamble(transcript: str | None) -> bool:
    normalized = _normalize(transcript or "")
    return any(
        normalized == prefix or normalized.startswith(f"{prefix} ")
        for prefix in FORBIDDEN_PREAMBLES
    )


def _transcript_starts_with_message(transcript: str | None, message: str) -> bool:
    spoken_words = _normalize(transcript or "").split()
    expected_words = _normalize(message).split()
    if not spoken_words or not expected_words:
        return False
    prefix_length = min(3, len(expected_words))
    return spoken_words[:prefix_length] == expected_words[:prefix_length]


def _cache_path(text: str, model: str, voice: str, root: Path) -> Path:
    digest = hashlib.sha256(
        f"{VOICE_CACHE_VERSION}|{model}|{voice}|{text}".encode("utf-8")
    ).hexdigest()
    return root / f"{digest}.mp3"


async def open_speech_stream(text: str) -> tuple[AsyncIterator[bytes], bool]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI no está configurado")

    settings.voice_cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = _cache_path(
        text,
        settings.voice_model,
        settings.voice_name,
        settings.voice_cache_dir,
    )
    if cache_path.exists():
        async def cached_stream() -> AsyncIterator[bytes]:
            with cache_path.open("rb") as cached_audio:
                while chunk := cached_audio.read(32 * 1024):
                    yield chunk

        return cached_stream(), True

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=18, max_retries=1)
    try:
        stream_manager = client.audio.speech.with_streaming_response.create(
            model=settings.voice_model,
            voice=settings.voice_name,
            input=text,
            instructions=VOICE_INSTRUCTIONS,
            response_format="mp3",
            speed=1.0,
        )
        response = await stream_manager.__aenter__()
    except Exception as error:
        raise RuntimeError("OpenAI no pudo generar la voz natural") from error

    async def live_stream() -> AsyncIterator[bytes]:
        chunks: list[bytes] = []
        try:
            async for chunk in response.iter_bytes(chunk_size=8 * 1024):
                if chunk:
                    chunks.append(chunk)
                    yield chunk
        finally:
            await stream_manager.__aexit__(None, None, None)
        if chunks:
            cache_path.write_bytes(b"".join(chunks))

    return live_stream(), False


async def synthesize(text: str) -> tuple[bytes, bool]:
    stream, cached = await open_speech_stream(text)
    chunks = [chunk async for chunk in stream]
    return b"".join(chunks), cached
