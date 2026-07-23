from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException

from ..db import get_db
from ..models import RecordCreate, RecordUpdate, SessionCreate, SessionCreated, SignRequest

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
            "SELECT id FROM articulos WHERE id = ?", (record.articulo_id,)
        ).fetchone()
        if not article:
            raise HTTPException(
                status_code=404, detail=f"Artículo {record.articulo_id} no encontrado"
            )
        cursor = connection.execute(
            """
            INSERT INTO registros
                (sesion_id, articulo_id, cantidad_fisica, unidad, estado_producto,
                 confianza, alertas_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id, record.articulo_id, record.cantidad_fisica, record.unidad,
                record.estado_producto, record.confianza,
                json.dumps(record.alertas, ensure_ascii=False), now_iso(),
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
    user = connection.execute(
        "SELECT * FROM usuarios WHERE id = ?", (session["usuario_id"],)
    ).fetchone()
    candidate_hash = hashlib.sha256(request.password.encode("utf-8")).hexdigest()
    matches_name = request.usuario.strip().casefold() in {
        user["nombre"].casefold(), str(user["id"]), (user["pin"] or "").casefold()
    }
    if not matches_name or candidate_hash != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    records = connection.execute(
        """
        SELECT articulo_id, cantidad_fisica, unidad, corregido, timestamp
        FROM registros WHERE sesion_id = ? ORDER BY id
        """,
        (session_id,),
    ).fetchall()
    canonical = json.dumps([dict(row) for row in records], sort_keys=True, ensure_ascii=False)
    signature_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    finished = now_iso()
    connection.execute(
        "UPDATE sesiones SET fin = ?, firmada = 1, hash_firma = ? WHERE id = ?",
        (finished, signature_hash, session_id),
    )
    connection.commit()
    return {"firmada": True, "fin": finished, "hash_firma": signature_hash}


@router.get("/{session_id}/resumen")
def session_summary(
    session_id: str,
    connection: sqlite3.Connection = Depends(get_db),
) -> dict:
    session = get_session(connection, session_id)
    records = connection.execute(
        """
        SELECT r.*, a.articulo, a.stock_sistema
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
    }
