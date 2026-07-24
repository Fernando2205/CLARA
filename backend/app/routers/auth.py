from __future__ import annotations

import re
import sqlite3

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

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


def to_usuario_out(row: sqlite3.Row) -> UsuarioOut:
    return UsuarioOut(
        id=row["id"],
        nombre=row["nombre"],
        cargo=row["cargo"],
        bodega_asignada=row["bodega_asignada"],
        turno=row["turno"],
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


@router.post("/register", response_model=RegisterResponse)
async def register(
    nombre: str = Form(...),
    cedula: str = Form(...),
    correo: str = Form(...),
    pin: str = Form(...),
    foto: UploadFile = File(...),
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
    row = connection.execute(
        "SELECT * FROM usuarios WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return RegisterResponse(usuario=to_usuario_out(row))


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
