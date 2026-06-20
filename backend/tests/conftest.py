import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _hermetic_external_services(monkeypatch):
    """Never inherit the developer's local .env for external endpoints, so the
    suite stays hermetic and can't accidentally call Mistral/OpenAI. Tests that
    exercise an endpoint configure it explicitly (and patch the client)."""
    import app.core.config as cfg

    for attr in (
        "stt_base_url", "stt_api_key", "stt_model",
        "llm_base_url", "llm_api_key", "llm_model",
    ):
        monkeypatch.setattr(cfg.settings, attr, None)


@pytest.fixture
def client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.database as db

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    db.init_db()

    from app.main import app
    with TestClient(app) as c:
        yield c
