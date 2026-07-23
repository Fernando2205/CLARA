from pathlib import Path

import httpx

from ..config import get_settings


async def send_document(path: Path, caption: str) -> str:
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return "simulado"
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument"
    async with httpx.AsyncClient(timeout=20) as client:
        with path.open("rb") as document:
            response = await client.post(
                url,
                data={"chat_id": settings.telegram_chat_id, "caption": caption},
                files={"document": (path.name, document, "application/pdf")},
            )
    response.raise_for_status()
    return "enviado"
