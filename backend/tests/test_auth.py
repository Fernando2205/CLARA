import uuid

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services import face as face_service

FOTO = {
    "foto": ("rostro.jpg", b"fake-image-bytes", "image/jpeg"),
    "firma": ("firma.png", b"fake-signature-bytes", "image/png"),
}


def random_embedding() -> np.ndarray:
    # Vector aleatorio de 512 dimensiones: para propósitos prácticos nunca
    # coincide por azar con un embedding ya persistido de otra corrida de tests,
    # así las pruebas no dependen de resetear la base de datos real (clara.db).
    return np.random.default_rng().standard_normal(512).astype(np.float32)


def register_payload(**overrides):
    unique = uuid.uuid4().hex[:10]
    payload = {
        "nombre": "Nuevo Usuario",
        "cedula": unique,
        "correo": f"{unique}@example.com",
        "pin": "5566",
    }
    payload.update(overrides)
    return payload


def test_register_creates_user_and_face_login_matches(monkeypatch):
    vector = random_embedding()
    monkeypatch.setattr(face_service, "extract_embedding", lambda _: vector)
    with TestClient(app) as client:
        created = client.post(
            "/auth/register", data=register_payload(), files=FOTO
        )
        assert created.status_code == 200
        usuario = created.json()["usuario"]
        assert usuario["firma_url"] == f"/firmas/{usuario['id']}.png"

        login = client.post("/auth/face-login", files=FOTO)
        assert login.status_code == 200
        body = login.json()
        assert body["resultado"] == "confirmado"
        assert body["usuario"]["id"] == usuario["id"]
        assert body["usuario"]["firma_url"] == f"/firmas/{usuario['id']}.png"


def test_register_requires_firma(monkeypatch):
    monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
    with TestClient(app) as client:
        response = client.post(
            "/auth/register",
            data=register_payload(),
            files={"foto": FOTO["foto"], "firma": ("firma.png", b"", "image/png")},
        )
    assert response.status_code == 422


def test_face_login_no_match_falls_back(monkeypatch):
    monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
    with TestClient(app) as client:
        client.post("/auth/register", data=register_payload(), files=FOTO)

        monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
        login = client.post("/auth/face-login", files=FOTO)
        assert login.status_code == 200
        assert login.json()["resultado"] == "sin_coincidencia"


def test_register_rejects_duplicate_cedula(monkeypatch):
    shared_cedula = uuid.uuid4().hex[:10]
    monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
    with TestClient(app) as client:
        first = client.post(
            "/auth/register",
            data=register_payload(cedula=shared_cedula),
            files=FOTO,
        )
        assert first.status_code == 200

        monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
        second = client.post(
            "/auth/register",
            data=register_payload(cedula=shared_cedula),
            files=FOTO,
        )
        assert second.status_code == 409


def test_register_rejects_no_face_detected(monkeypatch):
    def raise_no_face(_):
        raise face_service.NoFaceDetectedError("No se detectó ningún rostro en la foto")

    monkeypatch.setattr(face_service, "extract_embedding", raise_no_face)
    with TestClient(app) as client:
        response = client.post("/auth/register", data=register_payload(), files=FOTO)
    assert response.status_code == 422


def test_credentials_login_reuses_sign_logic():
    with TestClient(app) as client:
        ok = client.post(
            "/auth/login", json={"usuario": "Sofía Valencia", "password": "1234"}
        )
        assert ok.status_code == 200
        assert ok.json()["nombre"] == "Sofía Valencia"
        # firma_url puede ser None o una ruta real, según si ya se guardó una firma
        # para este usuario en este entorno; solo verificamos que el campo existe.
        assert "firma_url" in ok.json()

        wrong = client.post(
            "/auth/login", json={"usuario": "Sofía Valencia", "password": "0000"}
        )
        assert wrong.status_code == 401


def test_guardar_firma_actualiza_usuario_existente(monkeypatch):
    monkeypatch.setattr(face_service, "extract_embedding", lambda _: random_embedding())
    with TestClient(app) as client:
        created = client.post("/auth/register", data=register_payload(), files=FOTO)
        usuario_id = created.json()["usuario"]["id"]

        updated = client.post(
            f"/auth/usuarios/{usuario_id}/firma",
            files={"firma": ("nueva.png", b"otra-firma-distinta", "image/png")},
        )
        assert updated.status_code == 200
        assert updated.json()["firma_url"] == f"/firmas/{usuario_id}.png"

        missing = client.post(
            "/auth/usuarios/999999/firma",
            files={"firma": ("nueva.png", b"algo", "image/png")},
        )
        assert missing.status_code == 404
