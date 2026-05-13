import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.database as db

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)

    db.init_db()

    from app.main import app
    with TestClient(app) as c:
        yield c
