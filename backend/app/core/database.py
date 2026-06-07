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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcript_cache (
                video_id   TEXT PRIMARY KEY,
                language   TEXT NOT NULL,
                segments   TEXT NOT NULL,
                fetched_at TEXT NOT NULL
            )
        """)
        _migrate_discovered_items(conn)
        conn.commit()


# Columns added after the initial schema. ALTER TABLE ADD COLUMN is the SQLite
# way to evolve in place; each is wrapped so re-running on an up-to-date DB is a
# no-op (SQLite has no "ADD COLUMN IF NOT EXISTS").
_DISCOVERED_ITEM_ADDED_COLUMNS = (
    ("has_transcript", "INTEGER"),
    ("transcript_lang", "TEXT"),
    ("is_punctuated", "INTEGER"),
    ("word_count", "INTEGER"),
    ("reading_time_min", "INTEGER"),
    ("transcript_segments", "TEXT"),
)


def _migrate_discovered_items(conn: sqlite3.Connection) -> None:
    existing = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(job_discovered_items)")
    }
    for name, decl in _DISCOVERED_ITEM_ADDED_COLUMNS:
        if name not in existing:
            conn.execute(
                f"ALTER TABLE job_discovered_items ADD COLUMN {name} {decl}"
            )
