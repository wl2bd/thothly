import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import app.pipeline.transcribe as transcribe
from app.pipeline.transcribe import TranscribeError, stt_available, transcribe_file


@pytest.fixture
def configured(monkeypatch):
    """An STT endpoint is configured (Voxtral via Mistral, say)."""
    monkeypatch.setattr(transcribe.settings, "stt_base_url", "https://api.mistral.ai/v1")
    monkeypatch.setattr(transcribe.settings, "stt_model", "voxtral-mini-latest")
    monkeypatch.setattr(transcribe.settings, "stt_api_key", "key")


def _audio(tmp_path):
    path = tmp_path / "chunk.mp3"
    path.write_bytes(b"ID3 fake audio bytes")
    return path


def _raw(payload: dict):
    """Mimic the SDK's raw-response wrapper: a `.text` carrying the JSON body."""
    return SimpleNamespace(text=json.dumps(payload))


def test_stt_unavailable_by_default():
    # No endpoint configured in the test env.
    assert stt_available() is False


def test_transcribe_raises_when_unconfigured(tmp_path):
    with pytest.raises(TranscribeError):
        transcribe_file(_audio(tmp_path))


def test_transcribe_returns_text(configured, tmp_path):
    fake = MagicMock()
    fake.audio.transcriptions.with_raw_response.create.return_value = _raw(
        {"text": "  hello world  "}
    )

    with patch.object(transcribe, "_client", return_value=fake):
        result = transcribe_file(_audio(tmp_path), language="en")

    assert result.text == "hello world"
    # The language hint is forwarded; the model comes from settings.
    _, kwargs = fake.audio.transcriptions.with_raw_response.create.call_args
    assert kwargs["language"] == "en"
    assert kwargs["model"] == "voxtral-mini-latest"


def test_transcribe_parses_diarized_segments(configured, tmp_path):
    fake = MagicMock()
    fake.audio.transcriptions.with_raw_response.create.return_value = _raw(
        {
            "text": "Hi there. Welcome.",
            "segments": [
                {"text": "Hi there.", "start": 0.0, "end": 1.5, "speaker_id": "speaker_1"},
                {"text": "Welcome.", "start": 1.6, "end": 2.4, "speaker_id": "speaker_2"},
            ],
        }
    )

    with patch.object(transcribe, "_client", return_value=fake):
        result = transcribe_file(_audio(tmp_path))

    assert [s.speaker for s in result.segments] == ["speaker_1", "speaker_2"]
    assert result.segments[0].start == 0.0 and result.segments[0].end == 1.5
    # Diarization + segment timestamps were requested.
    _, kwargs = fake.audio.transcriptions.with_raw_response.create.call_args
    assert kwargs["extra_body"] == {"diarize": True}
    assert kwargs["timestamp_granularities"] == ["segment"]


def test_transcribe_falls_back_when_diarize_unsupported(configured, tmp_path):
    """A provider that 400s on the extras is retried plainly, not skipped."""

    class BadRequest(Exception):
        status_code = 400

    fake = MagicMock()
    create = fake.audio.transcriptions.with_raw_response.create
    create.side_effect = [BadRequest("unknown param: diarize"), _raw({"text": "plain text"})]

    with patch.object(transcribe, "_client", return_value=fake):
        result = transcribe_file(_audio(tmp_path))

    assert result.text == "plain text"
    assert result.segments == []
    assert create.call_count == 2  # rich attempt 4xx'd, plain attempt succeeded


def test_transcribe_omits_language_when_none(configured, tmp_path):
    fake = MagicMock()
    fake.audio.transcriptions.with_raw_response.create.return_value = _raw({"text": "x"})

    with patch.object(transcribe, "_client", return_value=fake):
        transcribe_file(_audio(tmp_path))

    _, kwargs = fake.audio.transcriptions.with_raw_response.create.call_args
    assert "language" not in kwargs


def test_transcribe_retries_then_raises(configured, tmp_path, monkeypatch):
    monkeypatch.setattr(transcribe.time, "sleep", lambda _: None)  # no real backoff
    fake = MagicMock()
    fake.audio.transcriptions.with_raw_response.create.side_effect = RuntimeError("503")

    with patch.object(transcribe, "_client", return_value=fake):
        with pytest.raises(TranscribeError):
            transcribe_file(_audio(tmp_path))

    # 3 retries on the (diarized) attempt before giving up; the plain fallback is
    # only tried after a 4xx, not a transient error.
    assert fake.audio.transcriptions.with_raw_response.create.call_count == 3
