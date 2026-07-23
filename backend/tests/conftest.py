import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def disable_external_openai(monkeypatch):
    """Las pruebas unitarias no consumen cuota ni dependen de red."""
    monkeypatch.setattr(get_settings(), "openai_api_key", "")
