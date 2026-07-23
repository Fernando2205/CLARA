import asyncio
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..config import get_settings
from ..models import SpeechRequest
from ..services.speech import open_speech_stream

router = APIRouter(tags=["voz"])
_requests_by_ip: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = asyncio.Lock()


async def enforce_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    async with _rate_lock:
        requests = _requests_by_ip[client_ip]
        while requests and now - requests[0] > 60:
            requests.popleft()
        if len(requests) >= 20:
            raise HTTPException(
                status_code=429,
                detail="Demasiadas solicitudes de voz. Espera un momento e inténtalo de nuevo.",
            )
        requests.append(now)


@router.post("/speak")
async def speak(payload: SpeechRequest, request: Request) -> StreamingResponse:
    await enforce_rate_limit(request.client.host if request.client else "desconocido")
    try:
        audio_stream, cached = await open_speech_stream(payload.texto)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail="No fue posible generar la voz natural en este momento.",
        ) from error
    return StreamingResponse(
        content=audio_stream,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Clara-Voice": "openai",
            "X-Clara-Model": get_settings().voice_model,
            "X-Clara-Speaker": get_settings().voice_name,
            "X-Clara-Cache": "hit" if cached else "miss",
        },
    )
