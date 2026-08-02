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


def _insert_item(job_id: str, item_id: str, compile_state: str | None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO job_discovered_items "
            "(id, job_id, source_index, item_index, item_type, title, url, "
            " selected, created_at, compile_state) "
            "VALUES (?, ?, 0, 0, 'youtube', 'A video', 'https://example.com/v', "
            " 1, ?, ?)",
            (item_id, job_id, now, compile_state),
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


def test_reaper_settles_in_flight_items(tmp_path, monkeypatch):
    """Once a failed job renders its item list, a `compiling` or `pending` item
    left behind by a killed process would show a spinner that never resolves on
    a screen that's supposed to be terminal. The reaper has to settle those items
    itself, in the same pass that fails the job — nothing else ever will."""
    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    database.init_db()

    _insert_job("a", "processing")
    _insert_item("a", "compiling-item", "compiling")
    _insert_item("a", "pending-item", "pending")
    _insert_item("a", "done-item", "done")

    assert reap_orphaned_jobs() == 1

    with get_connection() as conn:
        rows = {
            r["id"]: (r["compile_state"], r["compile_note"])
            for r in conn.execute(
                "SELECT id, compile_state, compile_note FROM job_discovered_items"
            )
        }

    message = "The server restarted before this item was built."
    assert rows["compiling-item"] == ("failed", message)
    assert rows["pending-item"] == ("failed", message)
    assert rows["done-item"] == ("done", None)  # already finished, left alone
