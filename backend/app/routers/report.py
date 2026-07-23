import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..config import get_settings
from ..db import get_db
from ..models import ReportRequest, ReportResponse
from ..services.emailer import send_report
from ..services.pdf import generate_reports
from ..services.telegram import send_document

router = APIRouter(tags=["reportes"])


@router.post("/report", response_model=ReportResponse)
async def report(
    request: ReportRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> ReportResponse:
    settings = get_settings()
    try:
        generated = generate_reports(
            connection, request.sesion_id, request.formatos, settings.generated_dir
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    details: dict[str, str] = {}
    pdf_path = generated.get("pdf")
    if request.enviar.telegram:
        if not pdf_path:
            raise HTTPException(status_code=400, detail="Telegram requiere formato PDF")
        try:
            details["telegram"] = await send_document(pdf_path, "Acta de inventario CLARA")
        except Exception:
            details["telegram"] = "error"
    if request.enviar.email:
        if not pdf_path:
            raise HTTPException(status_code=400, detail="El email requiere formato PDF")
        try:
            details["email"] = await send_report(
                pdf_path, request.enviar.email, "Acta de inventario CLARA"
            )
        except Exception:
            details["email"] = "error"

    requested = bool(details)
    statuses = set(details.values())
    if not requested:
        delivery = "no_solicitado"
    elif statuses == {"enviado"}:
        delivery = "enviado"
    elif "enviado" in statuses:
        delivery = "parcial"
    else:
        delivery = "simulado"

    urls = {
        file_format: f"/files/{request.sesion_id}/{path.name}"
        for file_format, path in generated.items()
    }
    return ReportResponse(archivos=urls, envio=delivery, detalle_envio=details)
