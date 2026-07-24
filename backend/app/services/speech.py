from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unicodedata
from collections.abc import AsyncIterator

import httpx

from ..config import get_settings


VOICE_CACHE_VERSION = "v5-elevenlabs"
FORBIDDEN_PREAMBLES = (
    "claro",
    "por supuesto",
    "aqui esta",
    "aqui tienes",
    "el mensaje dice",
    "voy a leer",
)
ELEVENLABS_STREAM_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"


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
    if not settings.elevenlabs_api_key or not settings.elevenlabs_voice_id:
        raise RuntimeError("ElevenLabs no está configurado")

    settings.voice_cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = _cache_path(
        text,
        settings.elevenlabs_model,
        settings.elevenlabs_voice_id,
        settings.voice_cache_dir,
    )
    if cache_path.exists():
        async def cached_stream() -> AsyncIterator[bytes]:
            with cache_path.open("rb") as cached_audio:
                while chunk := cached_audio.read(32 * 1024):
                    yield chunk

        return cached_stream(), True

    client = httpx.AsyncClient(timeout=18)
    stream_context = client.stream(
        "POST",
        ELEVENLABS_STREAM_URL.format(voice_id=settings.elevenlabs_voice_id),
        headers={
            "xi-api-key": settings.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": settings.elevenlabs_model,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        },
    )
    try:
        response = await stream_context.__aenter__()
        if response.status_code >= 400:
            detail = await response.aread()
            raise RuntimeError(
                f"ElevenLabs respondió {response.status_code}: {detail[:200].decode('utf-8', 'ignore')}"
            )
    except Exception as error:
        await stream_context.__aexit__(type(error), error, error.__traceback__)
        await client.aclose()
        if isinstance(error, RuntimeError):
            raise
        raise RuntimeError("ElevenLabs no pudo generar la voz natural") from error

    async def live_stream() -> AsyncIterator[bytes]:
        chunks: list[bytes] = []
        try:
            async for chunk in response.aiter_bytes(8 * 1024):
                if chunk:
                    chunks.append(chunk)
                    yield chunk
        finally:
            await stream_context.__aexit__(None, None, None)
            await client.aclose()
        if chunks:
            cache_path.write_bytes(b"".join(chunks))

    return live_stream(), False


async def synthesize(text: str) -> tuple[bytes, bool]:
    stream, cached = await open_speech_stream(text)
    chunks = [chunk async for chunk in stream]
    return b"".join(chunks), cached
