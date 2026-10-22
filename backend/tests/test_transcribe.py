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


# ── ElevenLabs Scribe: not OpenAI-compatible, its own small adapter ──────────

ELEVENLABS = transcribe.Endpoint("https://api.elevenlabs.io/v1", "scribe_v2", "xi-key")


def _http(status: int, payload: dict | None = None):
    return SimpleNamespace(status_code=status, text=json.dumps(payload or {}))


def test_elevenlabs_posts_its_own_request(tmp_path):
    words = {"text": "Hi.", "words": [{"text": "Hi.", "start": 0.0, "end": 0.4, "type": "word"}]}
    with patch.object(transcribe.httpx, "post", return_value=_http(200, words)) as post, \
         patch.object(transcribe, "_client") as openai_client:
        result = transcribe_file(_audio(tmp_path), language="fr", endpoint=ELEVENLABS)

    openai_client.assert_not_called()
    assert result.text == "Hi."
    args, kwargs = post.call_args
    assert args[0] == "https://api.elevenlabs.io/v1/speech-to-text"
    assert kwargs["headers"] == {"xi-api-key": "xi-key"}
    assert kwargs["data"] == {"model_id": "scribe_v2", "language_code": "fr", "diarize": "true"}
    assert "file" in kwargs["files"]


def test_elevenlabs_words_become_speaker_and_sentence_segments(tmp_path):
    payload = {
        "text": "Hello there. How are you? Fine.",
        "words": [
            {"text": "Hello", "start": 0.0, "end": 0.4, "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "start": 0.4, "end": 0.5, "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "there.", "start": 0.5, "end": 0.9, "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "start": 0.9, "end": 1.0, "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "(laughs)", "start": 1.0, "end": 1.2, "type": "audio_event", "speaker_id": "speaker_0"},
            {"text": "How", "start": 1.2, "end": 1.4, "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "start": 1.4, "end": 1.5, "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "are", "start": 1.5, "end": 1.6, "type": "word", "speaker_id": "speaker_0"},
            {"text": " ", "start": 1.6, "end": 1.7, "type": "spacing", "speaker_id": "speaker_0"},
            {"text": "you?", "start": 1.7, "end": 2.0, "type": "word", "speaker_id": "speaker_0"},
            {"text": "Fine.", "start": 2.2, "end": 2.6, "type": "word", "speaker_id": "speaker_1"},
        ],
    }
    with patch.object(transcribe.httpx, "post", return_value=_http(200, payload)):
        result = transcribe_file(_audio(tmp_path), endpoint=ELEVENLABS)

    assert [(s.text, s.speaker) for s in result.segments] == [
        ("Hello there.", "speaker_0"),
        ("How are you?", "speaker_0"),
        ("Fine.", "speaker_1"),
    ]
    assert (result.segments[1].start, result.segments[1].end) == (1.2, 2.0)


def test_elevenlabs_retries_plainly_when_diarize_is_refused(tmp_path):
    responses = [_http(422, {"detail": "bad"}), _http(200, {"text": "plain"})]
    with patch.object(transcribe.httpx, "post", side_effect=responses) as post:
        result = transcribe_file(_audio(tmp_path), endpoint=ELEVENLABS)

    assert result.text == "plain"
    assert "diarize" not in post.call_args.kwargs["data"]


def test_elevenlabs_key_check_lists_the_scribe_models():
    with patch.object(transcribe.httpx, "get", return_value=_http(200, [])) as get:
        assert transcribe.list_models(ELEVENLABS) == ["scribe_v2", "scribe_v1"]
    assert get.call_args.kwargs["headers"] == {"xi-api-key": "xi-key"}


def test_elevenlabs_key_check_accepts_a_key_scoped_to_transcription():
    # A restricted key may lack the models permission yet transcribe fine.
    scoped = _http(401, {"detail": {"status": "missing_permissions"}})
    with patch.object(transcribe.httpx, "get", return_value=scoped):
        assert transcribe.list_models(ELEVENLABS) == ["scribe_v2", "scribe_v1"]


def test_elevenlabs_key_check_refuses_a_bad_key():
    from app.pipeline.llm import KeyRefused

    bad = _http(401, {"detail": {"status": "invalid_api_key"}})
    with patch.object(transcribe.httpx, "get", return_value=bad):
        with pytest.raises(KeyRefused):
            transcribe.list_models(ELEVENLABS)
