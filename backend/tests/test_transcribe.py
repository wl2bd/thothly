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


def test_stt_unavailable_by_default():
    # No endpoint configured in the test env.
    assert stt_available() is False


def test_transcribe_raises_when_unconfigured(tmp_path):
    with pytest.raises(TranscribeError):
        transcribe_file(_audio(tmp_path))


def test_transcribe_returns_text(configured, tmp_path):
    fake = MagicMock()
    fake.audio.transcriptions.create.return_value = SimpleNamespace(text="  hello world  ")

    with patch.object(transcribe, "_client", return_value=fake):
        text = transcribe_file(_audio(tmp_path), language="en")

    assert text == "hello world"
    # The language hint is forwarded; the model comes from settings.
    _, kwargs = fake.audio.transcriptions.create.call_args
    assert kwargs["language"] == "en"
    assert kwargs["model"] == "voxtral-mini-latest"


def test_transcribe_omits_language_when_none(configured, tmp_path):
    fake = MagicMock()
    fake.audio.transcriptions.create.return_value = SimpleNamespace(text="x")

    with patch.object(transcribe, "_client", return_value=fake):
        transcribe_file(_audio(tmp_path))

    _, kwargs = fake.audio.transcriptions.create.call_args
    assert "language" not in kwargs


def test_transcribe_retries_then_raises(configured, tmp_path, monkeypatch):
    monkeypatch.setattr(transcribe.time, "sleep", lambda _: None)  # no real backoff
    fake = MagicMock()
    fake.audio.transcriptions.create.side_effect = RuntimeError("503")

    with patch.object(transcribe, "_client", return_value=fake):
        with pytest.raises(TranscribeError):
            transcribe_file(_audio(tmp_path))

    assert fake.audio.transcriptions.create.call_count == 3  # retried before giving up
