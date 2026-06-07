import json
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from yt_dlp.utils import DownloadError

from app.sources.models import Transcript, VideoMeta
from app.sources.youtube import YouTubeUnavailable, fetch_transcript, list_videos


def _make_ydl_mock(entries: list) -> MagicMock:
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = {"entries": entries}
    return mock_ydl


def _json3(*events: dict) -> bytes:
    return json.dumps({"events": list(events)}).encode("utf-8")


def _event(text: str, start_ms: int, dur_ms: int) -> dict:
    return {"tStartMs": start_ms, "dDurationMs": dur_ms, "segs": [{"utf8": text}]}


def _track(url: str) -> list[dict]:
    return [{"ext": "json3", "url": url}]


def _transcript_ydl(info: dict, payload: bytes) -> MagicMock:
    """A YoutubeDL mock that returns `info` for extract_info and `payload`
    (the json3 bytes) for urlopen(...).read()."""
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = info
    mock_ydl.urlopen.return_value.read.return_value = payload
    return mock_ydl


# ── list_videos ──────────────────────────────────────────────────────────────

@patch("app.sources.youtube.YoutubeDL")
def test_list_videos_returns_video_meta(mock_cls):
    mock_cls.return_value.__enter__.return_value = _make_ydl_mock([
        {"id": "abc123", "title": "Episode 1", "duration": 120, "upload_date": "20240101"},
        {"id": "def456", "title": "Episode 2", "duration": 300, "upload_date": "20240215"},
    ])

    result = list_videos("https://youtube.com/playlist?list=PLtest")

    assert len(result) == 2
    assert all(isinstance(v, VideoMeta) for v in result)
    assert result[0].id == "abc123"
    assert result[0].title == "Episode 1"
    assert result[0].duration_s == 120
    assert result[0].url == "https://www.youtube.com/watch?v=abc123"
    assert result[0].published_at == datetime(2024, 1, 1)


@patch("app.sources.youtube.YoutubeDL")
def test_list_videos_skips_none_entries(mock_cls):
    mock_cls.return_value.__enter__.return_value = _make_ydl_mock([
        {"id": "abc123", "title": "Valid", "duration": 60, "upload_date": None},
        None,
    ])

    result = list_videos("https://youtube.com/playlist?list=PLtest")

    assert len(result) == 1
    assert result[0].id == "abc123"


@patch("app.sources.youtube.YoutubeDL")
def test_list_videos_empty_playlist(mock_cls):
    mock_cls.return_value.__enter__.return_value = _make_ydl_mock([])

    result = list_videos("https://youtube.com/playlist?list=PLtest")

    assert result == []


@patch("app.sources.youtube.YoutubeDL")
def test_list_videos_raises_on_download_error(mock_cls):
    mock_ydl = MagicMock()
    mock_ydl.extract_info.side_effect = DownloadError("unavailable")
    mock_cls.return_value.__enter__.return_value = mock_ydl

    with pytest.raises(YouTubeUnavailable):
        list_videos("https://youtube.com/playlist?list=PLtest")


# ── fetch_transcript ─────────────────────────────────────────────────────────

@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_returns_transcript(mock_cls):
    info = {
        "language": "fr-FR",
        "subtitles": {},
        "automatic_captions": {"fr": _track("http://x/fr.json3")},
    }
    payload = _json3(
        {"tStartMs": 0, "dDurationMs": 1500, "segs": [{"utf8": "Bonjour"}, {"utf8": " le monde"}]},
    )
    mock_cls.return_value.__enter__.return_value = _transcript_ydl(info, payload)

    result = fetch_transcript("dQw4w9WgXcQ")

    assert isinstance(result, Transcript)
    assert result.video_id == "dQw4w9WgXcQ"
    assert result.language == "fr"
    assert len(result.segments) == 1
    assert result.segments[0].text == "Bonjour le monde"


@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_prefers_manual_over_auto(mock_cls):
    info = {
        "language": "en",
        "subtitles": {"fr": _track("http://x/fr-manual.json3")},
        "automatic_captions": {"en": _track("http://x/en-auto.json3")},
    }
    mock_ydl = _transcript_ydl(info, _json3(_event("Salut", 0, 1000)))
    mock_cls.return_value.__enter__.return_value = mock_ydl

    result = fetch_transcript("vid", languages=["fr", "en"])

    assert result.language == "fr"
    mock_ydl.urlopen.assert_called_once_with("http://x/fr-manual.json3")


@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_picks_original_over_translation(mock_cls):
    # A French video: the English auto-caption is a machine translation and must
    # NOT win over the original French track, even with fr/en both preferred.
    info = {
        "language": "fr-FR",
        "subtitles": {},
        "automatic_captions": {
            "fr": _track("http://x/fr.json3"),
            "en": _track("http://x/en-translated.json3"),
        },
    }
    mock_ydl = _transcript_ydl(info, _json3(_event("Bonjour", 0, 1000)))
    mock_cls.return_value.__enter__.return_value = mock_ydl

    result = fetch_transcript("vid", languages=["fr", "en"])

    assert result.language == "fr"
    mock_ydl.urlopen.assert_called_once_with("http://x/fr.json3")


@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_returns_none_when_no_subtitles(mock_cls):
    info = {"language": "fr", "subtitles": {}, "automatic_captions": {}}
    mock_cls.return_value.__enter__.return_value = _transcript_ydl(info, b"")

    assert fetch_transcript("dQw4w9WgXcQ") is None


@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_raises_on_download_error(mock_cls):
    mock_ydl = MagicMock()
    mock_ydl.extract_info.side_effect = DownloadError("blocked")
    mock_cls.return_value.__enter__.return_value = mock_ydl

    with pytest.raises(YouTubeUnavailable):
        fetch_transcript("dQw4w9WgXcQ")


@patch("app.sources.youtube.YoutubeDL")
def test_fetch_transcript_custom_languages(mock_cls):
    info = {
        "language": "es",
        "subtitles": {"es": _track("http://x/es.json3")},
        "automatic_captions": {},
    }
    mock_ydl = _transcript_ydl(info, _json3(_event("Hola", 0, 1000)))
    mock_cls.return_value.__enter__.return_value = mock_ydl

    result = fetch_transcript("someVideoId", languages=["es"])

    assert result is not None
    assert result.language == "es"
