from __future__ import annotations

import hashlib
import sqlite3


def password_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def verify_credentials(
    connection: sqlite3.Connection, usuario: str, password: str
) -> sqlite3.Row | None:
    identifier = usuario.strip().casefold()
    candidates = connection.execute(
        "SELECT * FROM usuarios WHERE lower(nombre) = ? OR lower(cedula) = ? OR lower(pin) = ?",
        (identifier, identifier, identifier),
    ).fetchall()

    row = next(
        (
            candidate
            for candidate in candidates
            if identifier
            in {
                candidate["nombre"].casefold(),
                (candidate["cedula"] or "").casefold(),
                (candidate["pin"] or "").casefold(),
            }
        ),
        None,
    )
    if row is None and identifier.isdigit():
        row = connection.execute(
            "SELECT * FROM usuarios WHERE id = ?", (int(identifier),)
        ).fetchone()

    if row is None:
        return None
    if password_hash(password) != row["password_hash"]:
        return None
    return row
