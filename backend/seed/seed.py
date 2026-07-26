from __future__ import annotations

import hashlib
import json
import sys
import unicodedata
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SEED_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import connect, init_db  # noqa: E402


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.replace("\xa0", " "))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join("".join(char if char.isalnum() else " " for char in text.lower()).split())


def password_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def seed_if_empty() -> dict[str, int]:
    init_db()
    # El catálogo vive junto al seed (no en docs/) para que backend/ sea
    # autocontenido: en despliegues como Railway, donde el Root Directory
    # del servicio es backend/, nada fuera de esa carpeta llega al build.
    catalog_path = SEED_DIR / "catalogo_piscilago.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    with connect() as connection:
        if connection.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0:
            connection.executemany(
                """
                INSERT INTO usuarios
                    (id, nombre, cargo, bodega_asignada, turno, pin, password_hash, cedula, correo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        # Cedula igual al PIN a propósito: en el demo es más
                        # rápido escribir "1234" una sola vez que el nombre.
                        1, "Sofía Valencia", "Auxiliar de Cocina 2",
                        "STOCK RESTAURANTE FUENTES AYB", "Mañana · 06:00–14:00",
                        "1234", password_hash("1234"), "1234", None,
                    ),
                    (
                        # Cuenta de demostración: la persona que despliega el
                        # demo la comparte para que cualquiera pueda entrar a
                        # probar CLARA sin registrarse.
                        4, "Test", "Cuenta demo",
                        None, "Invitado", "1111", password_hash("1111"),
                        "0123", "test@test.com",
                    ),
                ],
            )

        if connection.execute("SELECT COUNT(*) FROM articulos").fetchone()[0] == 0:
            rows = []
            for item in catalog:
                stock = float(item.get("stock") or 0)
                rows.append(
                    (
                        str(item["sku"]) if item.get("sku") is not None else None,
                        item["articulo"],
                        normalize_text(item["articulo"]),
                        item["bodega"],
                        item["unidad"],
                        stock,
                        stock * 0.7 if stock > 0 else None,
                        stock * 1.3 if stock > 0 else None,
                    )
                )
            connection.executemany(
                """
                INSERT INTO articulos
                    (sku, articulo, articulo_norm, bodega, unidad, stock_sistema, hist_min, hist_max)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

        return {
            "usuarios": connection.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0],
            "articulos": connection.execute("SELECT COUNT(*) FROM articulos").fetchone()[0],
        }


if __name__ == "__main__":
    print(seed_if_empty())
