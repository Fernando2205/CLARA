from __future__ import annotations

import re
import sqlite3

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..config import get_settings
from ..db import get_db
from ..models import (
    CredentialsLoginRequest,
    FaceLoginResult,
    RegisterResponse,
    UsuarioOut,
)
from ..services import face
from ..services.credentials import password_hash, verify_credentials

router = APIRouter(prefix="/auth", tags=["auth"])

PIN_PATTERN = re.compile(r"^\d{4}$")


def firma_path_for(usuario_id: int):
    return get_settings().firma_dir / f"{usuario_id}.png"


def to_usuario_out(row: sqlite3.Row) -> UsuarioOut:
    tiene_firma = firma_path_for(row["id"]).exists()
    return UsuarioOut(
        id=row["id"],
        nombre=row["nombre"],
        cargo=row["cargo"],
        bodega_asignada=row["bodega_asignada"],
        turno=row["turno"],
        firma_url=f"/firmas/{row['id']}.png" if tiene_firma else None,
    )


def _enrolled_embeddings(connection: sqlite3.Connection) -> list[tuple[int, np.ndarray]]:
    rows = connection.execute(
        "SELECT id, face_embedding FROM usuarios WHERE face_embedding IS NOT NULL"
    ).fetchall()
    return [(row["id"], face.blob_to_embedding(row["face_embedding"])) for row in rows]


async def _read_embedding(foto: UploadFile) -> np.ndarray:
    image_bytes = await foto.read()
    try:
        return face.extract_embedding(image_bytes)
    except face.NoFaceDetectedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except face.MultipleFacesDetectedError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _save_firma(usuario_id: int, firma: UploadFile) -> None:
    data = await firma.read()
    if not data:
        raise HTTPException(status_code=422, detail="La firma está vacía")
    firma_path_for(usuario_id).write_bytes(data)


@router.post("/register", response_model=RegisterResponse)
async def register(
    nombre: str = Form(...),
    cedula: str = Form(...),
    correo: str = Form(...),
    pin: str = Form(...),
    foto: UploadFile = File(...),
    firma: UploadFile = File(...),
    connection: sqlite3.Connection = Depends(get_db),
) -> RegisterResponse:
    nombre = nombre.strip()
    cedula = cedula.strip()
    correo = correo.strip()
    if not nombre or not cedula or not correo:
        raise HTTPException(status_code=422, detail="Nombre, cédula y correo son obligatorios")
    if not PIN_PATTERN.match(pin):
        raise HTTPException(status_code=422, detail="El PIN debe tener exactamente 4 dígitos")

    existing = connection.execute(
        "SELECT id FROM usuarios WHERE lower(cedula) = ? OR lower(correo) = ?",
        (cedula.casefold(), correo.casefold()),
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=409, detail="Ya existe una cuenta con esa cédula o correo"
        )

    embedding = await _read_embedding(foto)
    firma_bytes = await firma.read()
    if not firma_bytes:
        raise HTTPException(status_code=422, detail="Debes dibujar tu firma antes de registrarte")

    match = face.find_best_match(embedding, _enrolled_embeddings(connection))
    if match is not None and match[1] >= face.MATCH_THRESHOLD:
        raise HTTPException(
            status_code=409, detail="Este rostro ya está registrado en otra cuenta"
        )

    cursor = connection.execute(
        """
        INSERT INTO usuarios
            (nombre, cargo, cedula, correo, password_hash, face_embedding, face_embedding_model)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            nombre, "Colaborador", cedula, correo, password_hash(pin),
            face.embedding_to_blob(embedding), face.EMBEDDING_MODEL,
        ),
    )
    connection.commit()
    usuario_id = cursor.lastrowid
    firma_path_for(usuario_id).write_bytes(firma_bytes)

    row = connection.execute(
        "SELECT * FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()
    return RegisterResponse(usuario=to_usuario_out(row))


@router.post("/usuarios/{usuario_id}/firma", response_model=UsuarioOut)
async def guardar_firma(
    usuario_id: int,
    firma: UploadFile = File(...),
    connection: sqlite3.Connection = Depends(get_db),
) -> UsuarioOut:
    row = connection.execute(
        "SELECT * FROM usuarios WHERE id = ?", (usuario_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    await _save_firma(usuario_id, firma)
    return to_usuario_out(row)


@router.post("/face-login", response_model=FaceLoginResult)
async def face_login(
    foto: UploadFile = File(...),
    connection: sqlite3.Connection = Depends(get_db),
) -> FaceLoginResult:
    embedding = await _read_embedding(foto)

    match = face.find_best_match(embedding, _enrolled_embeddings(connection))
    if match is None:
        return FaceLoginResult(resultado="sin_coincidencia")

    usuario_id, similarity = match
    if similarity >= face.MATCH_THRESHOLD:
        row = connection.execute(
            "SELECT * FROM usuarios WHERE id = ?", (usuario_id,)
        ).fetchone()
        return FaceLoginResult(
            resultado="confirmado", usuario=to_usuario_out(row), similitud=similarity
        )
    if similarity >= face.AMBIGUOUS_THRESHOLD:
        return FaceLoginResult(resultado="ambiguo", similitud=similarity)
    return FaceLoginResult(resultado="sin_coincidencia", similitud=similarity)


@router.post("/login", response_model=UsuarioOut)
def credentials_login(
    request: CredentialsLoginRequest,
    connection: sqlite3.Connection = Depends(get_db),
) -> UsuarioOut:
    if not PIN_PATTERN.match(request.password):
        raise HTTPException(status_code=422, detail="El PIN debe tener exactamente 4 dígitos")
    row = verify_credentials(connection, request.usuario, request.password)
    if row is None:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return to_usuario_out(row)
