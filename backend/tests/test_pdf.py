import base64

from app.config import get_settings
from app.services import pdf as pdf_service

# PNG válido de 1x1 píxel transparente, usado como firma de prueba.
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _base_session(**overrides):
    session = {
        "usuario_id": 4242,
        "bodega": "STOCK RESTAURANTE FUENTES AYB",
        "nombre": "Test User",
        "cargo": "Auxiliar",
        "inicio": "2026-07-24T08:00:00+00:00",
        "fin": "2026-07-24T09:00:00+00:00",
        "hash_firma": "a" * 64,
    }
    session.update(overrides)
    return session


def test_pdf_embeds_the_drawn_signature_image(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "firma_dir", tmp_path)
    (tmp_path / "4242.png").write_bytes(TINY_PNG)

    with_signature = tmp_path / "with-signature.pdf"
    pdf_service.generate_pdf(with_signature, _base_session(), [])

    without_file = tmp_path / "without-file.pdf"
    pdf_service.generate_pdf(without_file, _base_session(usuario_id=9999), [])

    # El PDF con la imagen de la firma embebida (base64) debe pesar
    # notablemente más que uno idéntico sin ningún archivo de firma.
    assert with_signature.stat().st_size > without_file.stat().st_size + 100


def test_pdf_does_not_show_signature_when_session_unsigned(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "firma_dir", tmp_path)
    (tmp_path / "4242.png").write_bytes(TINY_PNG)

    unsigned = tmp_path / "unsigned.pdf"
    pdf_service.generate_pdf(unsigned, _base_session(hash_firma=None), [])

    signed = tmp_path / "signed.pdf"
    pdf_service.generate_pdf(signed, _base_session(), [])

    assert signed.stat().st_size > unsigned.stat().st_size
