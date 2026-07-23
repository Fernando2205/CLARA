from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from .config import get_settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    bodega_asignada TEXT,
    turno TEXT,
    pin TEXT,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articulos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT,
    articulo TEXT NOT NULL,
    articulo_norm TEXT NOT NULL,
    bodega TEXT NOT NULL,
    unidad TEXT NOT NULL,
    stock_sistema REAL NOT NULL DEFAULT 0,
    hist_min REAL,
    hist_max REAL
);

CREATE INDEX IF NOT EXISTS idx_articulos_bodega ON articulos(bodega);
CREATE INDEX IF NOT EXISTS idx_articulos_norm ON articulos(articulo_norm);

CREATE TABLE IF NOT EXISTS sesiones (
    id TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    bodega TEXT NOT NULL,
    modo TEXT NOT NULL,
    inicio TEXT NOT NULL,
    fin TEXT,
    firmada INTEGER NOT NULL DEFAULT 0,
    hash_firma TEXT,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sesion_id TEXT NOT NULL,
    articulo_id INTEGER NOT NULL,
    cantidad_fisica REAL NOT NULL,
    unidad TEXT NOT NULL,
    estado_producto TEXT,
    confianza REAL NOT NULL DEFAULT 1,
    alertas_json TEXT NOT NULL DEFAULT '[]',
    corregido INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(sesion_id) REFERENCES sesiones(id),
    FOREIGN KEY(articulo_id) REFERENCES articulos(id)
);

CREATE INDEX IF NOT EXISTS idx_registros_sesion ON registros(sesion_id);
"""


def connect() -> sqlite3.Connection:
    settings = get_settings()
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(
        settings.database_path,
        timeout=10,
        check_same_thread=False,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with connect() as connection:
        connection.executescript(SCHEMA)


def get_db() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
    finally:
        connection.close()
