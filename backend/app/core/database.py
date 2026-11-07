import sqlite3

from app.core.config import settings


def get_connection() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.data_dir / "thothly.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        # WAL lets the job page's polling read while a compile writes, instead
        # of both queuing on one lock. It is stored in the file, so once is enough.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                status      TEXT NOT NULL,
                sources     TEXT NOT NULL,
                book_title  TEXT,
                error       TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        _add_missing_columns(conn, "jobs", _JOB_ADDED_COLUMNS)
        # One row per discovered item. `item` is what discovery found (JSON of
        # app.sources.models.DiscoveredItem); the other columns are what the
        # visitor and the compile do with it.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS job_items (
                id             TEXT PRIMARY KEY,
                job_id         TEXT NOT NULL REFERENCES jobs(id),
                item           TEXT NOT NULL,
                source_index   INTEGER NOT NULL,
                item_index     INTEGER NOT NULL,
                selected       INTEGER NOT NULL DEFAULT 0,
                -- The visitor's compile order (review lets sources be dragged).
                selected_order INTEGER,
                -- pending → compiling → done | skipped | failed, with the
                -- user-facing reason (or, while compiling, the stage) in the note.
                compile_state  TEXT,
                compile_note   TEXT
            )
        """)
        _merge_legacy_job_items(conn)
        # Transcripts keyed by video id or audio URL (app/sources/transcript_cache.py).
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcripts (
                key        TEXT PRIMARY KEY,
                transcript TEXT NOT NULL,
                stored_at  TEXT NOT NULL
            )
        """)
        _merge_legacy_transcript_caches(conn)
        # Cleaned-content cache for the LLM roles, keyed by the content (video id
        # or blog url), the applied role set, and the model — so a re-compile with
        # the same choices never re-calls the LLM.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcript_llm_cache (
                content_key TEXT NOT NULL,
                roles_key   TEXT NOT NULL,
                model       TEXT NOT NULL,
                content_md  TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                PRIMARY KEY (content_key, roles_key, model)
            )
        """)
        # Paid vendor answers (treg/Monid), keyed by a hash of the whole request,
        # so the same call is bought once per its route's TTL. See core/gateway.py.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS gateway_cache (
                key       TEXT PRIMARY KEY,
                status    INTEGER NOT NULL,
                data      TEXT NOT NULL,
                via       TEXT NOT NULL,
                stored_at REAL NOT NULL
            )
        """)
        _drop_translated_video_transcripts(conn)
        conn.commit()


# Columns added after the initial schema. ALTER TABLE ADD COLUMN is the SQLite
# way to evolve in place; each is wrapped so re-running on an up-to-date DB is a
# no-op (SQLite has no "ADD COLUMN IF NOT EXISTS").
_JOB_ADDED_COLUMNS = (
    ("llm_roles", "TEXT"),  # JSON list of selected LLM role ids for the compile
    # Which model actually wrote this book, as "provider/model" — never the key.
    # Without it a compilation can be measured but not attributed, and comparing
    # two models on the same source is the point of measuring at all.
    ("llm_model", "TEXT"),
    # 1 when the title was typed in the workspace, so review keeps it instead
    # of offering its own default.
    ("title_named", "INTEGER"),
    # 1 once the visitor asked to stop: the runner checks it before each item and
    # before each AI call.
    ("stop_requested", "INTEGER"),
    # JSON CoverSettings chosen at review; NULL = the house cover.
    ("cover", "TEXT"),
)

def _merge_legacy_job_items(conn: sqlite3.Connection) -> None:
    """Move the items of the older one-column-per-field table into `job_items`."""
    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "job_discovered_items" not in tables:
        return
    _add_missing_columns(conn, "job_discovered_items", tuple(
        (name, "TEXT") for name in (
            "has_transcript", "transcript_lang", "is_punctuated", "word_count",
            "reading_time_min", "uncertain", "set_aside", "selected_order",
            "compile_state", "compile_note",
        )
    ))
    conn.execute("""
        INSERT OR IGNORE INTO job_items (
            id, job_id, item, source_index, item_index, selected,
            selected_order, compile_state, compile_note
        )
        SELECT id, job_id, json_object(
            'title', title, 'url', url, 'item_type', item_type,
            'source_index', source_index, 'item_index', item_index,
            'estimated_duration_s', estimated_duration_s,
            'estimated_size_chars', estimated_size_chars,
            'preview_html', preview_html,
            'has_transcript', CASE WHEN has_transcript IS NULL THEN NULL
                                   ELSE json(CASE WHEN has_transcript THEN 'true' ELSE 'false' END) END,
            'transcript_lang', transcript_lang,
            'is_punctuated', CASE WHEN is_punctuated IS NULL THEN NULL
                                  ELSE json(CASE WHEN is_punctuated THEN 'true' ELSE 'false' END) END,
            'word_count', word_count, 'reading_time_min', reading_time_min,
            'uncertain', json(CASE WHEN uncertain THEN 'true' ELSE 'false' END),
            'set_aside', set_aside
        ), source_index, item_index, selected, selected_order, compile_state, compile_note
        FROM job_discovered_items
    """)
    conn.execute("DROP TABLE job_discovered_items")


def _merge_legacy_transcript_caches(conn: sqlite3.Connection) -> None:
    """Fold the two caches that used to sit side by side, one for videos and one
    for episodes, into `transcripts`, then drop them. Episode rows from before
    per-segment timing and speakers (format_version < 2) are left behind, to be
    transcribed again."""
    tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "transcript_cache" in tables:
        _add_missing_columns(conn, "transcript_cache", (
            ("chapters", "TEXT"), ("uploader", "TEXT"), ("channel_url", "TEXT"),
        ))
        conn.execute("""
            INSERT OR IGNORE INTO transcripts (key, transcript, stored_at)
            SELECT video_id, json_object(
                'video_id', video_id, 'language', language,
                'segments', json(segments), 'chapters', json(coalesce(chapters, '[]')),
                'uploader', uploader, 'channel_url', channel_url
            ), fetched_at FROM transcript_cache
        """)
        conn.execute("DROP TABLE transcript_cache")
    if "podcast_transcript_cache" in tables:
        _add_missing_columns(conn, "podcast_transcript_cache", (("format_version", "INTEGER"),))
        conn.execute("""
            INSERT OR IGNORE INTO transcripts (key, transcript, stored_at)
            SELECT audio_url, json_object(
                'video_id', audio_url, 'language', language, 'segments', json(segments)
            ), fetched_at FROM podcast_transcript_cache WHERE format_version = 2
        """)
        conn.execute("DROP TABLE podcast_transcript_cache")


_TRANSCRIPT_RULE_VERSION = 2


def _drop_translated_video_transcripts(conn: sqlite3.Connection) -> None:
    """Once per fix: forget video transcripts cached in a preferred language.
    Until 2026-11-07 the paid path could read a French talk in English: hand-made
    English subtitles taken over the spoken French (fixed in version 1), or the
    captions of YouTube's English auto-dub, which it plays by default to an
    English locale (fixed in version 2). Those videos are fetched again under
    the fixed rule; a transcript in any other language was the spoken one and
    is kept, and so is its AI polish; the polish of a dropped one goes with it,
    since it was written from the wrong text. Episodes (keyed by URL) never
    went through that rule."""
    if conn.execute("PRAGMA user_version").fetchone()[0] >= _TRANSCRIPT_RULE_VERSION:
        return
    for lang in {code.split("-")[0].lower() for code in settings.preferred_languages}:
        stale = """
            SELECT key FROM transcripts WHERE key NOT LIKE 'http%'
            AND (json_extract(transcript, '$.language') = ?
                 OR json_extract(transcript, '$.language') LIKE ? || '-%')
        """
        conn.execute(f"DELETE FROM transcript_llm_cache WHERE content_key IN ({stale})", (lang, lang))
        conn.execute(f"DELETE FROM transcripts WHERE key IN ({stale})", (lang, lang))
    conn.execute(f"PRAGMA user_version = {_TRANSCRIPT_RULE_VERSION}")


def _add_missing_columns(
    conn: sqlite3.Connection, table: str, columns: tuple[tuple[str, str], ...]
) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, decl in columns:
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
