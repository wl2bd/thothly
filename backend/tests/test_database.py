"""A database written by an older backend opens with its data intact."""

import json

import app.core.database as database
from app.jobs import repository
from app.sources import transcript_cache
from app.sources.models import Transcript


def _legacy(conn) -> None:
    for table in ("transcripts", "job_items"):
        conn.execute(f"DROP TABLE {table}")
    conn.execute(
        "CREATE TABLE transcript_cache (video_id TEXT PRIMARY KEY, language TEXT, "
        "segments TEXT, fetched_at TEXT, chapters TEXT, uploader TEXT, channel_url TEXT)"
    )
    conn.execute(
        "INSERT INTO transcript_cache VALUES ('vid', 'fr', ?, 't', ?, 'Chan', 'https://c')",
        (json.dumps([{"text": "bonjour", "start_s": 0, "duration_s": 1}]),
         json.dumps([{"title": "Intro", "start_s": 0, "end_s": 9}])),
    )
    conn.execute(
        "CREATE TABLE podcast_transcript_cache (audio_url TEXT PRIMARY KEY, language TEXT, "
        "segments TEXT, fetched_at TEXT, format_version INTEGER)"
    )
    conn.executemany(
        "INSERT INTO podcast_transcript_cache VALUES (?, 'en', ?, 't', ?)",
        [
            ("https://a/new.mp3", json.dumps([{"text": "hi", "start_s": 0, "duration_s": 1, "speaker": "s1"}]), 2),
            ("https://a/old.mp3", json.dumps([{"text": "hi", "start_s": 0, "duration_s": 1}]), 1),
        ],
    )
    conn.execute(
        "INSERT INTO jobs (id, status, sources, created_at, updated_at) "
        "VALUES ('j', 'reviewing', '[]', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')"
    )
    conn.execute(
        "CREATE TABLE job_discovered_items (id TEXT PRIMARY KEY, job_id TEXT, source_index INTEGER, "
        "item_index INTEGER, item_type TEXT, title TEXT, url TEXT, estimated_duration_s INTEGER, "
        "estimated_size_chars INTEGER, preview_html TEXT, selected INTEGER, created_at TEXT, "
        "has_transcript INTEGER, is_punctuated INTEGER, uncertain INTEGER, set_aside TEXT)"
    )
    conn.execute(
        "INSERT INTO job_discovered_items VALUES ('j-0-0', 'j', 0, 0, 'youtube', 'A video', "
        "'https://www.youtube.com/watch?v=vid', 60, NULL, NULL, 1, 't', 1, 0, 0, 'Likely off-topic')"
    )
    conn.commit()


def test_older_caches_and_items_survive_the_upgrade():
    with database.get_connection() as conn:
        _legacy(conn)

    database.init_db()

    video = transcript_cache.get("vid")
    assert (video.language, video.uploader, video.chapters[0].title) == ("fr", "Chan", "Intro")
    assert transcript_cache.get("https://a/new.mp3").segments[0].speaker == "s1"
    assert transcript_cache.get("https://a/old.mp3") is None  # re-transcribed with speakers

    [item] = repository.get_job("j").discovered_items
    assert (item.title, item.has_transcript, item.is_punctuated, item.uncertain) == (
        "A video", True, False, False,
    )
    assert (item.set_aside, item.estimated_duration_s, item.selected) == ("Likely off-topic", 60, True)


def test_init_drops_video_transcripts_cached_in_a_preferred_language_once():
    # Cached before 2026-11-07, an English transcript may be a hand translation
    # of a French talk; refetch it. French and episode rows stay.
    with database.get_connection() as conn:
        conn.execute("PRAGMA user_version = 1")  # a DB from the first fix
        conn.commit()
    for key, lang in (("vidEN", "en-GB"), ("vidFR", "fr"), ("https://cdn.example/ep.mp3", "en")):
        transcript_cache.put(key, Transcript(video_id=key, language=lang, segments=[]))

    database.init_db()
    assert transcript_cache.get("vidEN") is None
    assert transcript_cache.get("vidFR") is not None
    assert transcript_cache.get("https://cdn.example/ep.mp3") is not None

    transcript_cache.put("vidEN", Transcript(video_id="vidEN", language="en", segments=[]))
    database.init_db()  # already done: a fresh English fetch is kept
    assert transcript_cache.get("vidEN") is not None
