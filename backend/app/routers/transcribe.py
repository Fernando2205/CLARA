from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import AsyncOpenAI

from ..config import get_settings

router = APIRouter(tags=["voz"])


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="Transcripción remota no configurada; agrega OPENAI_API_KEY al backend.",
        )
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo de audio está vacío")
    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=20, max_retries=1)
    result = await client.audio.transcriptions.create(
        model=settings.transcribe_model,
        file=(audio.filename or "captura.webm", content, audio.content_type or "audio/webm"),
        language="es",
    )
    return {"texto": result.text}
