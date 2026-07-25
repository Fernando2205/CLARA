from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from ..db import get_db
from ..models import (
    RecordCreate,
    RecordUpdate,
    SessionCreate,
    SessionCreated,
    SessionHistoryItem,
    SignRequest,
)
from ..services.credentials import verify_credentials

router = APIRouter(prefix="/sessions", tags=["sesiones"])


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_session(connection: sqlite3.Connection, session_id: str) -> sqlite3.Row:
    session = connection.execute(
        "SELECT * FROM sesiones WHERE id = ?", (session_id,)
    ).fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return session


def ensure_mutable(session: sqlite3.Row) -> None:
    if session["firmada"]:
        raise HTTPException(status_code=409, detail="La sesión firmada es inmutable")


@router.post("", response_model=SessionCreated)
def create_session(
    request: SessionCreate,
    connection: sqlite3.Connection = Depends(get_db),
) -> SessionCreated:
    user = connection.execute(
        "SELECT id FROM usuarios WHERE id = ?", (request.usuario_id,)
    ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    session_id = str(uuid.uuid4())
    connection.execute(
        """
        INSERT INTO sesiones (id, usuario_id, bodega, modo, inicio)
        VALUES (?, ?, ?, ?, ?)
        """,
        (session_id, request.usuario_id, request.bodega, request.modo, now_iso()),
    )
    connection.commit()
    total = connection.execute(
        "SELECT COUNT(*) FROM articulos WHERE bodega = ?", (request.bodega,)
    ).fetchone()[0]
    return SessionCreated(sesion_id=session_id, total_referencias=total)


@router.get("", response_model=list[SessionHistoryItem])
def list_sessions(
    usuario_id: int,
    connection: sqlite3.Connection = Depends(get_db),
) -> list[SessionHistoryItem]:
    rows = connection.execute(
        """
        SELECT s.id, s.bodega, s.inicio, s.fin, s.inventario_aplicado,
               COUNT(r.id) AS contadas,
               COALESCE(SUM(r.corregido), 0) AS corregidos
        FROM sesiones s
        LEFT JOIN registros r ON r.sesion_id = s.id
        WHERE s.usuario_id = ? AND s.firmada = 1
        GROUP BY s.id
        ORDER BY s.fin DESC
        """,
        (usuario_id,),
    ).fetchall()
    items = []
    for row in rows:
        start = datetime.fromisoformat(row["inicio"])
        end = datetime.fromisoformat(row["fin"])
        items.append(SessionHistoryItem(
            sesion_id=row["id"],
            bodega=row["bodega"],
            fin=row["fin"],
            contadas=row["contadas"],
            tiempo_min=round((end - start).total_seconds() / 60, 1),
            corregidos=row["corregidos"],
            inventario_aplicado=bool(row["inventario_aplicado"]),
        ))
    return items


@router.post("/{session_id}/registros")
def save_records(
    session_id: str,
    payload: RecordCreate | list[RecordCreate] = Body(...),
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    session = get_session(connection, session_id)
    ensure_mutable(session)
    records = payload if isinstance(payload, list) else [payload]
    created: list[dict] = []
    for record in records:
        article = connection.execute(
            "SELECT id, bodega, unidad, stock_sistema FROM articulos WHERE id = ?",
            (record.articulo_id,),
        ).fetchone()
        if not article:
            raise HTTPException(
                status_code=404, detail=f"Artículo {record.articulo_id} no encontrado"
            )
        if article["bodega"] != session["bodega"]:
            raise HTTPException(
                status_code=409,
                detail="El artículo no pertenece a la bodega de esta sesión",
            )
        if article["unidad"] != record.unidad:
            raise HTTPException(
                status_code=409,
                detail="La unidad no coincide con la unidad del catálogo",
            )
        if record.corregido:
            current = connection.execute(
                """
                SELECT id, stock_sistema_antes FROM registros
                WHERE sesion_id = ? AND articulo_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (session_id, record.articulo_id),
            ).fetchone()
            if current:
                connection.execute(
                    """
                    UPDATE registros
                    SET cantidad_fisica = ?, unidad = ?, estado_producto = ?,
                        confianza = ?, alertas_json = ?, corregido = 1,
                        stock_sistema_antes = COALESCE(stock_sistema_antes, ?),
                        timestamp = ?
                    WHERE id = ?
                    """,
                    (
                        record.cantidad_fisica,
                        record.unidad,
                        record.estado_producto,
                        record.confianza,
                        json.dumps(record.alertas, ensure_ascii=False),
                        article["stock_sistema"],
                        now_iso(),
                        current["id"],
                    ),
                )
                created.append({
                    "id": current["id"],
                    **record.model_dump(),
                    "actualizado": True,
                })
                continue
        cursor = connection.execute(
            """
            INSERT INTO registros
                (sesion_id, articulo_id, cantidad_fisica, unidad, estado_producto,
                 confianza, alertas_json, corregido, stock_sistema_antes, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id, record.articulo_id, record.cantidad_fisica, record.unidad,
                record.estado_producto, record.confianza,
                json.dumps(record.alertas, ensure_ascii=False),
                int(record.corregido), article["stock_sistema"], now_iso(),
            ),
        )
        created.append({"id": cursor.lastrowid, **record.model_dump()})
    connection.commit()
    return {"registros": created}


@router.patch("/{session_id}/registros/{record_id}")
def update_record(
    session_id: str,
    record_id: int,
    request: RecordUpdate,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    session = get_session(connection, session_id)
    ensure_mutable(session)
    current = connection.execute(
        "SELECT * FROM registros WHERE id = ? AND sesion_id = ?",
        (record_id, session_id),
    ).fetchone()
    if not current:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    connection.execute(
        """
        UPDATE registros SET cantidad_fisica = ?, unidad = ?, corregido = 1,
            timestamp = ? WHERE id = ? AND sesion_id = ?
        """,
        (
            request.cantidad_fisica,
            request.unidad or current["unidad"],
            now_iso(), record_id, session_id,
        ),
    )
    connection.commit()
    return {"id": record_id, "corregido": True}


@router.post("/{session_id}/firmar")
def sign_session(
    session_id: str,
    request: SignRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    session = get_session(connection, session_id)
    ensure_mutable(session)
    user = verify_credentials(connection, request.usuario, request.password)
    if not user or user["id"] != session["usuario_id"]:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    connection.execute(
        """
        UPDATE registros
        SET stock_sistema_antes = (
            SELECT a.stock_sistema FROM articulos a
            WHERE a.id = registros.articulo_id
        )
        WHERE sesion_id = ? AND stock_sistema_antes IS NULL
        """,
        (session_id,),
    )
    records = connection.execute(
        """
        SELECT articulo_id, cantidad_fisica, unidad, corregido,
               stock_sistema_antes, timestamp
        FROM registros WHERE sesion_id = ? ORDER BY id
        """,
        (session_id,),
    ).fetchall()
    canonical = json.dumps([dict(row) for row in records], sort_keys=True, ensure_ascii=False)
    signature_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    finished = now_iso()
    latest_records = connection.execute(
        """
        SELECT r.articulo_id, r.cantidad_fisica
        FROM registros r
        WHERE r.sesion_id = ?
          AND r.id = (
              SELECT MAX(rr.id) FROM registros rr
              WHERE rr.sesion_id = r.sesion_id
                AND rr.articulo_id = r.articulo_id
          )
        ORDER BY r.articulo_id
        """,
        (session_id,),
    ).fetchall()
    for record in latest_records:
        connection.execute(
            """
            UPDATE articulos
            SET stock_sistema = ?
            WHERE id = ? AND bodega = ?
            """,
            (
                record["cantidad_fisica"],
                record["articulo_id"],
                session["bodega"],
            ),
        )
    connection.execute(
        """
        UPDATE sesiones
        SET fin = ?, firmada = 1, hash_firma = ?,
            inventario_aplicado = 1, aplicado_en = ?
        WHERE id = ?
        """,
        (finished, signature_hash, finished, session_id),
    )
    connection.commit()
    return {
        "firmada": True,
        "fin": finished,
        "hash_firma": signature_hash,
        "inventario_maestro": {
            "aplicado": True,
            "articulos_actualizados": len(latest_records),
            "aplicado_en": finished,
        },
    }


@router.get("/{session_id}/resumen")
def session_summary(
    session_id: str,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    session = get_session(connection, session_id)
    records = connection.execute(
        """
        SELECT r.*, a.articulo,
               COALESCE(r.stock_sistema_antes, a.stock_sistema) AS stock_sistema
        FROM registros r JOIN articulos a ON a.id = r.articulo_id
        WHERE r.sesion_id = ? ORDER BY r.id
        """,
        (session_id,),
    ).fetchall()
    start = datetime.fromisoformat(session["inicio"])
    end = datetime.fromisoformat(session["fin"]) if session["fin"] else datetime.now(timezone.utc)
    total = connection.execute(
        "SELECT COUNT(*) FROM articulos WHERE bodega = ?", (session["bodega"],)
    ).fetchone()[0]
    differences = [
        {
            "articulo": row["articulo"],
            "fisico": row["cantidad_fisica"],
            "sistema": row["stock_sistema"],
            "delta": row["cantidad_fisica"] - row["stock_sistema"],
        }
        for row in records
    ]
    return {
        "contadas": len(records),
        "total": total,
        "tiempo_min": round((end - start).total_seconds() / 60, 1),
        "corregidos": sum(row["corregido"] for row in records),
        "con_alerta": sum(bool(json.loads(row["alertas_json"])) for row in records),
        "diferencias": differences,
        "firmada": bool(session["firmada"]),
        "inventario_aplicado": bool(session["inventario_aplicado"]),
        "aplicado_en": session["aplicado_en"],
    }
