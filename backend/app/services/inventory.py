from __future__ import annotations

import sqlite3

from ..models import InventoryItem, InventoryResponse, InventorySummary


def inventory_rows(
    connection: sqlite3.Connection,
    warehouse: str,
    session_id: str | None = None,
) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT
            a.*,
            r.cantidad_fisica AS conteo_fisico,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS contado_en_sesion
        FROM articulos a
        LEFT JOIN registros r ON r.id = (
            SELECT rr.id FROM registros rr
            WHERE rr.sesion_id = ? AND rr.articulo_id = a.id
            ORDER BY rr.id DESC LIMIT 1
        )
        WHERE a.bodega = ?
        ORDER BY a.articulo COLLATE NOCASE
        """,
        (session_id or "__sin_sesion__", warehouse),
    ).fetchall()


def row_to_inventory_item(row: sqlite3.Row) -> InventoryItem:
    counted = bool(row["contado_en_sesion"])
    current = row["conteo_fisico"] if counted else row["stock_sistema"]
    return InventoryItem(
        id=row["id"],
        sku=row["sku"],
        nombre=row["articulo"],
        unidad=row["unidad"],
        bodega=row["bodega"],
        stock_sistema=row["stock_sistema"],
        cantidad_actual=current,
        fuente="conteo_fisico" if counted else "sistema",
        contado_en_sesion=counted,
    )


def summarize(items: list[InventoryItem]) -> InventorySummary:
    return InventorySummary(
        total=len(items),
        con_existencias=sum(item.cantidad_actual > 0 for item in items),
        sin_existencias=sum(item.cantidad_actual == 0 for item in items),
        saldo_negativo=sum(item.cantidad_actual < 0 for item in items),
        contadas_en_sesion=sum(item.contado_en_sesion for item in items),
    )


def get_inventory(
    connection: sqlite3.Connection,
    warehouse: str,
    session_id: str | None = None,
) -> InventoryResponse:
    items = [
        row_to_inventory_item(row)
        for row in inventory_rows(connection, warehouse, session_id)
    ]
    return InventoryResponse(
        bodega=warehouse,
        items=items,
        resumen=summarize(items),
    )


def get_inventory_item(
    connection: sqlite3.Connection,
    article_id: int,
    session_id: str | None = None,
) -> InventoryItem | None:
    row = connection.execute(
        """
        SELECT
            a.*,
            r.cantidad_fisica AS conteo_fisico,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS contado_en_sesion
        FROM articulos a
        LEFT JOIN registros r ON r.id = (
            SELECT rr.id FROM registros rr
            WHERE rr.sesion_id = ? AND rr.articulo_id = a.id
            ORDER BY rr.id DESC LIMIT 1
        )
        WHERE a.id = ?
        """,
        (session_id or "__sin_sesion__", article_id),
    ).fetchone()
    return row_to_inventory_item(row) if row else None
