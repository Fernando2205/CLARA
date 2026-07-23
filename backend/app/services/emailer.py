import base64
from pathlib import Path

import httpx

from ..config import get_settings


async def send_report(path: Path, recipient: str, subject: str) -> str:
    settings = get_settings()
    if not settings.resend_api_key:
        return "simulado"
    payload = {
        "from": settings.report_from_email,
        "to": [recipient],
        "subject": subject,
        "html": "<p>Adjuntamos el acta de inventario generada y firmada en CLARA.</p>",
        "attachments": [{
            "filename": path.name,
            "content": base64.b64encode(path.read_bytes()).decode("ascii"),
        }],
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json=payload,
        )
    response.raise_for_status()
    return "enviado"
