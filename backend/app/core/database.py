import sqlite3

from app.core.config import settings


def get_connection() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.data_dir / "thothly.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                status      TEXT NOT NULL DEFAULT 'pending',
                sources     TEXT NOT NULL,
                book_title  TEXT,
                output_path TEXT,
                error       TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_discovered_items (
                id                   TEXT PRIMARY KEY,
                job_id               TEXT NOT NULL REFERENCES jobs(id),
                source_index         INTEGER NOT NULL,
                item_index           INTEGER NOT NULL,
                item_type            TEXT NOT NULL,
                title                TEXT NOT NULL,
                url                  TEXT NOT NULL,
                estimated_duration_s INTEGER,
                estimated_size_chars INTEGER,
                preview_html         TEXT,
                selected             INTEGER NOT NULL DEFAULT 0,
                created_at           TEXT NOT NULL
            )
        """)
        conn.commit()
