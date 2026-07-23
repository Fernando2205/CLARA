from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..models import InventoryResponse
from ..services.inventory import get_inventory
from ..services.matcher import normalize_text

router = APIRouter(tags=["inventario"])


@router.get("/inventory", response_model=InventoryResponse)
def inventory(
    bodega: str,
    sesion_id: str | None = None,
    q: str = Query(default="", max_length=100),
    estado: str = Query(default="todos", pattern="^(todos|con_stock|sin_stock|negativo|contado)$"),
    connection: sqlite3.Connection = Depends(get_db),
) -> InventoryResponse:
    result = get_inventory(connection, bodega, sesion_id)
    query = normalize_text(q)
    items = result.items
    if query:
        items = [
            item for item in items
            if query in normalize_text(item.nombre)
            or query in normalize_text(item.sku)
        ]
    if estado == "con_stock":
        items = [item for item in items if item.cantidad_actual > 0]
    elif estado == "sin_stock":
        items = [item for item in items if item.cantidad_actual == 0]
    elif estado == "negativo":
        items = [item for item in items if item.cantidad_actual < 0]
    elif estado == "contado":
        items = [item for item in items if item.contado_en_sesion]
    return InventoryResponse(
        bodega=result.bodega,
        items=items,
        resumen=result.resumen,
    )
