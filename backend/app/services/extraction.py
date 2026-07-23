from __future__ import annotations

import sqlite3
from typing import Literal

from ..models import (
    AlternativeOut, ArticleOut, ExtractRequest, ExtractResponse, RawExtraction,
)
from .matcher import match_catalog


def article_out(row: sqlite3.Row) -> ArticleOut:
    return ArticleOut(
        id=row["id"],
        sku=row["sku"],
        nombre=row["articulo"],
        unidad=row["unidad"],
        stock_sistema=row["stock_sistema"],
        bodega=row["bodega"],
    )


def alternative_out(row: sqlite3.Row, confidence: float | None = None) -> AlternativeOut:
    return AlternativeOut(
        id=row["id"],
        sku=row["sku"],
        nombre=row["articulo"],
        unidad=row["unidad"],
        bodega=row["bodega"],
        stock_sistema=row["stock_sistema"],
        confianza=confidence,
    )


def resolve_extraction(
    connection: sqlite3.Connection,
    request: ExtractRequest,
    raw: RawExtraction,
    origin: Literal["openai", "local"],
) -> ExtractResponse:
    if raw.es_correccion:
        record = None
        article = None
        if request.sesion_id:
            record = connection.execute(
                """
                SELECT r.id, a.* FROM registros r
                JOIN articulos a ON a.id = r.articulo_id
                WHERE r.sesion_id = ?
                ORDER BY r.id DESC LIMIT 1
                """,
                (request.sesion_id,),
            ).fetchone()
        if record is None and request.contexto_ultimo_sku:
            article = connection.execute(
                """
                SELECT * FROM articulos
                WHERE sku = ?
                ORDER BY CASE WHEN bodega = ? THEN 0 ELSE 1 END
                LIMIT 1
                """,
                (request.contexto_ultimo_sku, request.bodega),
            ).fetchone()
        article = record or article
        return ExtractResponse(
            tipo="correccion" if article and raw.cantidad is not None else "ambiguo",
            articulo=article_out(article) if article else None,
            cantidad=raw.cantidad,
            unidad_dicha=raw.unidad,
            estado_producto=raw.estado_producto,
            confianza_match=1 if article else 0,
            correccion_de=record["id"] if record else None,
            origen=origin,
        )

    if not raw.producto_texto:
        return ExtractResponse(
            tipo="no_match",
            cantidad=raw.cantidad,
            unidad_dicha=raw.unidad,
            estado_producto=raw.estado_producto,
            origen=origin,
        )

    match = match_catalog(connection, raw.producto_texto, request.bodega)
    alternatives = [
        alternative_out(row, confidence) for row, confidence in match.alternatives
    ]
    if match.article is None:
        return ExtractResponse(
            tipo="no_match",
            cantidad=raw.cantidad,
            unidad_dicha=raw.unidad,
            estado_producto=raw.estado_producto,
            confianza_match=match.confidence,
            alternativas=alternatives,
            origen=origin,
        )

    unit = raw.unidad
    if unit is None and raw.cantidad == 0 and match.article["unidad"] == "Unidad":
        unit = "unidades"
    response_type = "ambiguo" if raw.cantidad is None or unit is None else "registro"
    if match.ambiguous:
        response_type = "ambiguo"
    return ExtractResponse(
        tipo=response_type,
        articulo=article_out(match.article),
        cantidad=raw.cantidad,
        unidad_dicha=unit,
        estado_producto=raw.estado_producto,
        confianza_match=match.confidence,
        alternativas=alternatives,
        requiere_seleccion=match.ambiguous,
        origen=origin,
    )
