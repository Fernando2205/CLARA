import pytest

from app.config import get_settings
from seed.seed import seed_if_empty


@pytest.fixture(autouse=True)
def disable_external_openai(monkeypatch):
    """Las pruebas unitarias no consumen cuota ni dependen de red."""
    monkeypatch.setattr(get_settings(), "openai_api_key", "")


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """Cada test corre contra su propia base sqlite y carpeta de firmas
    temporales, sembrada igual que la real: antes, los tests escribian
    sobre el clara.db real (sin fixture de aislamiento), acumulando
    usuarios "Nuevo Usuario" de prueba cada vez que corria pytest."""
    settings = get_settings()
    monkeypatch.setattr(settings, "database_path", tmp_path / "test.db")
    monkeypatch.setattr(settings, "firma_dir", tmp_path / "firmas")
    settings.firma_dir.mkdir(parents=True, exist_ok=True)
    seed_if_empty()
