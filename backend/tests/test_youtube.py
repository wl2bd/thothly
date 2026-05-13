from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from yt_dlp.utils import DownloadError
from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled

from app.sources.models import Transcript, VideoMeta
from app.sources.youtube import YouTubeUnavailable, fetch_transcript, list_videos


def _make_snippet(text: str, start: float, duration: float) -> MagicMock:
    s = MagicMock()
    s.text = text
    s.start = start
    s.duration = duration
    return s


def _make_ydl_mock(entries: list) -> MagicMock:
    mock_ydl = MagicMock()
    mock_ydl.extract_info.return_value = {"entries": entries}
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

@patch("app.sources.youtube.YouTubeTranscriptApi")
def test_fetch_transcript_returns_transcript(mock_api_cls):
    snippets = [_make_snippet("Bonjour", 0.0, 1.5), _make_snippet("le monde", 1.5, 1.0)]
    mock_transcript = MagicMock()
    mock_transcript.language_code = "fr"
    mock_transcript.fetch.return_value = snippets

    mock_list = MagicMock()
    mock_list.find_transcript.return_value = mock_transcript

    mock_api = MagicMock()
    mock_api.list.return_value = mock_list
    mock_api_cls.return_value = mock_api

    result = fetch_transcript("dQw4w9WgXcQ")

    assert isinstance(result, Transcript)
    assert result.video_id == "dQw4w9WgXcQ"
    assert result.language == "fr"
    assert len(result.segments) == 2
    assert result.segments[0].text == "Bonjour"
    assert result.full_text == "Bonjour le monde"


@patch("app.sources.youtube.YouTubeTranscriptApi")
def test_fetch_transcript_language_fallback(mock_api_cls):
    snippets = [_make_snippet("Hello", 0.0, 1.0)]
    mock_transcript = MagicMock()
    mock_transcript.language_code = "en"
    mock_transcript.fetch.return_value = snippets

    mock_list = MagicMock()
    mock_list.find_transcript.return_value = mock_transcript

    mock_api = MagicMock()
    mock_api.list.return_value = mock_list
    mock_api_cls.return_value = mock_api

    result = fetch_transcript("dQw4w9WgXcQ")

    assert result is not None
    assert result.language == "en"
    mock_list.find_transcript.assert_called_once_with(["fr", "en"])


@patch("app.sources.youtube.YouTubeTranscriptApi")
def test_fetch_transcript_returns_none_when_disabled(mock_api_cls):
    mock_api = MagicMock()
    mock_api.list.side_effect = TranscriptsDisabled("dQw4w9WgXcQ")
    mock_api_cls.return_value = mock_api

    result = fetch_transcript("dQw4w9WgXcQ")

    assert result is None


@patch("app.sources.youtube.YouTubeTranscriptApi")
def test_fetch_transcript_returns_none_when_not_found(mock_api_cls):
    mock_list = MagicMock()
    mock_list.find_transcript.side_effect = NoTranscriptFound("dQw4w9WgXcQ", ["fr", "en"], {})

    mock_api = MagicMock()
    mock_api.list.return_value = mock_list
    mock_api_cls.return_value = mock_api

    result = fetch_transcript("dQw4w9WgXcQ")

    assert result is None


@patch("app.sources.youtube.YouTubeTranscriptApi")
def test_fetch_transcript_custom_languages(mock_api_cls):
    snippets = [_make_snippet("Hola", 0.0, 1.0)]
    mock_transcript = MagicMock()
    mock_transcript.language_code = "es"
    mock_transcript.fetch.return_value = snippets

    mock_list = MagicMock()
    mock_list.find_transcript.return_value = mock_transcript

    mock_api = MagicMock()
    mock_api.list.return_value = mock_list
    mock_api_cls.return_value = mock_api

    result = fetch_transcript("someVideoId", languages=["es"])

    assert result is not None
    mock_list.find_transcript.assert_called_once_with(["es"])
