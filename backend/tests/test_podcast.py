from unittest.mock import patch

import pytest

import app.sources.podcast as podcast
from app.pipeline.transcribe import STTResult, STTSegment
from app.sources.discovery import detect_kind, discover_source
from app.sources.podcast import load_episode_transcript

AUDIO_URL = "https://cdn.example/show/ep1.mp3"


@pytest.fixture
def db(tmp_path, monkeypatch):
    """A scratch DB + STT endpoint configured (Voxtral via Mistral, say)."""
    import app.core.config as cfg
    import app.core.database as database

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    monkeypatch.setattr(podcast.settings, "stt_base_url", "https://api.mistral.ai/v1")
    monkeypatch.setattr(podcast.settings, "stt_model", "voxtral-mini-latest")
    database.init_db()


# ── discovery ─────────────────────────────────────────────────────────────────

def test_detect_kind_audio_url_is_podcast():
    assert detect_kind(AUDIO_URL) == "podcast"
    assert detect_kind("https://example.com/article") == "blog"


def test_discover_podcast_uses_title_hint():
    name, items = discover_source(AUDIO_URL, 0, kind="podcast", title="Ep 1: Origins")

    assert name == "Ep 1: Origins"
    assert len(items) == 1
    assert items[0].item_type == "podcast"
    assert items[0].url == AUDIO_URL
    assert items[0].title == "Ep 1: Origins"


def test_discover_podcast_falls_back_to_url_slug():
    _, items = discover_source(AUDIO_URL, 0, kind="podcast")
    assert items[0].title == "Ep1"  # derived from the .mp3 slug


def test_discover_podcast_carries_duration_for_cost_estimate():
    # The episode length (from the search result) must reach the discovered item,
    # or the review screen's transcription cost estimate reads as $0.
    _, items = discover_source(AUDIO_URL, 0, kind="podcast", duration_s=1470)
    assert items[0].estimated_duration_s == 1470


# ── transcript assembly + cache ───────────────────────────────────────────────

def test_transcribe_episode_assembles_transcript(db):
    # ffmpeg is absent in CI, so _split yields the whole file as one chunk.
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast,
        "transcribe_file",
        return_value=STTResult(text="Hello world. This is the show.", segments=[]),
    ) as mock_tx:
        transcript = load_episode_transcript(AUDIO_URL)

    assert transcript is not None
    assert transcript.video_id == AUDIO_URL
    assert transcript.full_text == "Hello world. This is the show."
    assert mock_tx.call_count == 1


def test_transcribe_episode_keeps_segments_and_speakers(db):
    """A diarized single-request result becomes timed, speaker-labelled segments."""
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    result = STTResult(
        text="Hi. Hello back.",
        segments=[
            STTSegment(text="Hi.", start=0.0, end=1.0, speaker="speaker_1"),
            STTSegment(text="Hello back.", start=1.2, end=2.5, speaker="speaker_2"),
        ],
    )
    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast, "transcribe_file", return_value=result
    ):
        transcript = load_episode_transcript(AUDIO_URL)

    assert [s.speaker for s in transcript.segments] == ["speaker_1", "speaker_2"]
    assert transcript.segments[1].start_s == 1.2  # single chunk → no offset


def test_transcribe_episode_is_cached(db):
    def fake_download(url, workdir):
        path = workdir / "episode.mp3"
        path.write_bytes(b"audio")
        return path

    with patch.object(podcast, "_download", side_effect=fake_download), patch.object(
        podcast,
        "transcribe_file",
        return_value=STTResult(text="cached text", segments=[]),
    ) as mock_tx:
        first = load_episode_transcript(AUDIO_URL)
        second = load_episode_transcript(AUDIO_URL)  # served from the DB cache

    assert first.full_text == second.full_text == "cached text"
    assert mock_tx.call_count == 1  # transcribed once, never re-paid


def test_transcribe_episode_skips_when_unconfigured(tmp_path, monkeypatch):
    import app.core.config as cfg
    import app.core.database as database

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    monkeypatch.setattr(podcast.settings, "stt_base_url", None)  # no STT endpoint
    database.init_db()

    assert load_episode_transcript(AUDIO_URL) is None


def test_transcribe_episode_skips_on_download_failure(db):
    with patch.object(podcast, "_download", return_value=None):
        assert load_episode_transcript(AUDIO_URL) is None


def test_split_without_ffmpeg_returns_whole_file(tmp_path):
    audio = tmp_path / "episode.mp3"
    audio.write_bytes(b"audio")
    with patch.object(podcast.shutil, "which", return_value=None):
        assert podcast._split(audio, 25) == [audio]
