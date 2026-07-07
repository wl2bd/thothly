from datetime import datetime, timezone

import app.core.config as cfg
import app.core.database as database
from app.core.database import get_connection
from app.jobs.repository import reap_orphaned_jobs


def _insert_job(job_id: str, status: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, sources, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (job_id, status, "[]", now, now),
        )
        conn.commit()


def test_reaper_fails_only_in_flight_jobs(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    database.init_db()

    _insert_job("a", "discovering")
    _insert_job("b", "processing")
    _insert_job("c", "reviewing")  # waiting on the user, no worker running → keep
    _insert_job("d", "completed")

    assert reap_orphaned_jobs() == 2

    with get_connection() as conn:
        rows = {
            r["id"]: (r["status"], r["error"])
            for r in conn.execute("SELECT id, status, error FROM jobs")
        }

    assert rows["a"][0] == "failed" and rows["a"][1]  # reaped, with a message
    assert rows["b"][0] == "failed" and rows["b"][1]
    assert rows["c"][0] == "reviewing"  # untouched
    assert rows["d"][0] == "completed"  # untouched


def test_reaper_is_noop_when_nothing_in_flight(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    database.init_db()

    _insert_job("done", "completed")
    assert reap_orphaned_jobs() == 0
