from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from ..db import get_db
from ..models import ExtractRequest, ExtractResponse
from ..services.extraction import resolve_extraction
from ..services.gpt import extract_entities

router = APIRouter(tags=["captura"])


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    request: ExtractRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> ExtractResponse:
    raw, origin = await extract_entities(request.frase)
    return resolve_extraction(connection, request, raw, origin)
