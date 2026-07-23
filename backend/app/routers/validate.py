import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..models import ValidateRequest, ValidateResponse
from ..services.rules import evaluate_rules

router = APIRouter(tags=["captura"])


@router.post("/validate", response_model=ValidateResponse)
def validate(
    request: ValidateRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> ValidateResponse:
    article = connection.execute(
        "SELECT * FROM articulos WHERE id = ?", (request.articulo_id,)
    ).fetchone()
    if not article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    alerts = evaluate_rules(
        connection,
        article,
        request.cantidad,
        request.unidad_dicha,
        request.sesion_id,
        request.confianza_match,
    )
    return ValidateResponse(
        alertas=alerts,
        guardable_sin_confirmar=not alerts and request.confianza_match >= 0.85,
    )
