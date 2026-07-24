import uuid

from fastapi.testclient import TestClient

from app.main import app

FIRMA = {"firma": ("firma.png", b"fake-signature-bytes", "image/png")}


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


def test_register_creates_user():
    with TestClient(app) as client:
        created = client.post("/auth/register", data=register_payload(), files=FIRMA)
        assert created.status_code == 200
        usuario = created.json()["usuario"]
        assert usuario["firma_url"] == f"/firmas/{usuario['id']}.png"


def test_register_requires_firma():
    with TestClient(app) as client:
        response = client.post(
            "/auth/register",
            data=register_payload(),
            files={"firma": ("firma.png", b"", "image/png")},
        )
    assert response.status_code == 422


def test_register_rejects_duplicate_cedula():
    shared_cedula = uuid.uuid4().hex[:10]
    with TestClient(app) as client:
        first = client.post(
            "/auth/register", data=register_payload(cedula=shared_cedula), files=FIRMA
        )
        assert first.status_code == 200

        second = client.post(
            "/auth/register", data=register_payload(cedula=shared_cedula), files=FIRMA
        )
        assert second.status_code == 409


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


def test_guardar_firma_actualiza_usuario_existente():
    with TestClient(app) as client:
        created = client.post("/auth/register", data=register_payload(), files=FIRMA)
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
