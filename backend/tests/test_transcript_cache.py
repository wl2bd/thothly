from unittest.mock import patch

import pytest

from app.sources.models import Chapter, Transcript, TranscriptSegment


@pytest.fixture
def db(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.database as database

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    database.init_db()


def _transcript(video_id: str) -> Transcript:
    return Transcript(
        video_id=video_id,
        language="fr",
        segments=[TranscriptSegment(text="bonjour", start_s=0.0, duration_s=1.0)],
    )


@patch("app.sources.transcript_cache.fetch_transcript")
def test_successful_fetch_is_cached(mock_fetch, db):
    from app.sources.transcript_cache import load_transcript

    mock_fetch.return_value = _transcript("vid")

    first = load_transcript("vid")
    second = load_transcript("vid")

    assert first.language == "fr"
    assert second.segments[0].text == "bonjour"
    mock_fetch.assert_called_once()  # second call served from cache


@patch("app.sources.transcript_cache.fetch_transcript")
def test_chapters_survive_the_cache(mock_fetch, db):
    from app.sources.transcript_cache import load_transcript

    transcript = _transcript("vid")
    transcript.chapters = [Chapter(title="Introduction", start_s=0.0, end_s=10.0)]
    mock_fetch.return_value = transcript

    load_transcript("vid")  # stores
    cached = load_transcript("vid")  # reads back from cache

    assert cached.chapters[0].title == "Introduction"
    assert cached.chapters[0].end_s == 10.0
    mock_fetch.assert_called_once()


@patch("app.sources.transcript_cache.fetch_transcript")
def test_missing_transcript_is_not_cached(mock_fetch, db):
    from app.sources.transcript_cache import load_transcript

    mock_fetch.return_value = None  # no subtitles

    assert load_transcript("none") is None
    assert load_transcript("none") is None
    assert mock_fetch.call_count == 2  # re-checked, never cached as "absent"
