"""Optional OpenAI-compatible speech-to-text layer.

The audio twin of `pipeline/llm.py`: point `STT_BASE_URL`/`STT_MODEL` (+ an
optional `STT_API_KEY`) at any OpenAI-compatible `audio/transcriptions`
endpoint — Mistral's Voxtral (`voxtral-mini-latest`), a local vLLM or
whisper.cpp server (no key), or OpenAI. When unconfigured, `stt_available()`
is False and podcast episodes are skipped, exactly like a YouTube video that
has no subtitles.

We ask for segment timestamps and (Mistral) speaker diarization so the caller
can build natural, dialogue-aware paragraphs instead of one flat block. A
provider that rejects those extras (a 4xx) is retried with a plain request, so
the layer stays provider-agnostic: richer output when available, plain text
otherwise.

This module transcribes a single audio file that already fits under the
provider's per-request length cap; splitting long episodes into such chunks is
the caller's job (see `app/sources/podcast.py`).
"""

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from app.core.config import settings
from app.pipeline.llm import KeyRefused
from app.pipeline.providers import ELEVENLABS_BASE_URL, Endpoint, describe_error

logger = logging.getLogger(__name__)


class TranscribeError(Exception):
    """A transcription call failed (after retries). Callers skip the episode."""


class _HTTPStatus(Exception):
    """A non-2xx answer from a provider called without an SDK. Carries only the
    status, never the body, so `describe_error` stays key-safe."""

    def __init__(self, status_code: int):
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code


class _UnsupportedParams(Exception):
    """The endpoint rejected the request params (4xx) — retry without the extras."""


@dataclass
class STTSegment:
    """One timestamped (and, when diarized, speaker-labelled) transcript span."""

    text: str
    start: float
    end: float
    speaker: str | None = None


@dataclass
class STTResult:
    """A transcription: the flat text plus, when the provider returns them,
    timestamped segments (with speaker labels when diarization was honoured)."""

    text: str
    segments: list[STTSegment] = field(default_factory=list)


def stt_endpoint(endpoint: Endpoint | None = None) -> Endpoint | None:
    """The visitor's endpoint when supplied, else the server's config, else None."""
    if endpoint is not None:
        return endpoint
    if settings.stt_base_url and settings.stt_model:
        return Endpoint(settings.stt_base_url, settings.stt_model, settings.stt_api_key)
    return None


def stt_available(endpoint: Endpoint | None = None) -> bool:
    """True when a transcription would have an endpoint to go to."""
    return stt_endpoint(endpoint) is not None


def _client(endpoint: Endpoint):
    """Build the OpenAI SDK client lazily so `openai` is only imported when an
    STT endpoint is actually configured."""
    from openai import OpenAI

    return OpenAI(
        base_url=endpoint.base_url,
        # Local servers (vLLM, whisper.cpp) need no key; the SDK still wants one.
        api_key=endpoint.api_key or "not-needed",
        timeout=settings.stt_timeout_s,
    )


def transcribe_file(
    path: Path,
    *,
    language: str | None = None,
    diarize: bool | None = None,
    endpoint: Endpoint | None = None,
) -> STTResult:
    """Transcribe one audio file into an STTResult.

    `path` must already be under the provider's per-request length cap. We first
    ask for segment timestamps + diarization; if the endpoint rejects those, we
    fall back to a plain request. Transient errors are retried with backoff;
    TranscribeError is raised only when nothing works, so the caller can skip
    the episode gracefully.
    """
    ep = stt_endpoint(endpoint)
    if ep is None:
        raise TranscribeError("Speech-to-text is not configured")

    want_diarize = settings.stt_diarize if diarize is None else diarize
    # `language` is an ISO-639-1 hint; omit it rather than pass None/"" so the
    # provider auto-detects when we don't have a preference.
    base = {"language": language} if language else {}

    # Param sets from richest to plainest. A 4xx on the rich set (a provider
    # that doesn't know `diarize`/timestamps) drops to the next; transient
    # errors retry in place.
    param_sets: list[dict] = []
    if want_diarize:
        param_sets.append(
            {"timestamp_granularities": ["segment"], "extra_body": {"diarize": True}}
        )
    param_sets.append({})

    last_exc: Exception | None = None
    for params in param_sets:
        try:
            data = _request_with_retries(path, ep, {**base, **params})
        except _UnsupportedParams as exc:
            logger.info("STT endpoint rejected extras %s; retrying simpler", list(params))
            last_exc = exc
            continue
        return _parse_response(data)

    raise TranscribeError(f"Transcription failed: {last_exc}")


def _request_with_retries(path: Path, ep: Endpoint, params: dict) -> dict:
    """One transcription call (raw JSON), retried on transient errors.

    Uses `with_raw_response` so we read the provider's full JSON body — the
    typed SDK model drops provider extras like `speaker_id`. A 4xx is raised as
    `_UnsupportedParams` (don't retry; the caller drops the extras instead)."""
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with open(path, "rb") as audio:
                if _is_elevenlabs(ep):
                    return _elevenlabs_transcribe(audio, ep, params)
                raw = _client(ep).audio.transcriptions.with_raw_response.create(
                    model=ep.model,
                    file=audio,
                    **params,
                )
            return json.loads(raw.text)
        except Exception as exc:  # noqa: BLE001 — provider SDKs raise many types
            if _is_bad_request(exc):
                raise _UnsupportedParams(describe_error(exc)) from exc
            last_exc = exc
            wait = 2**attempt
            logger.warning(
                "Transcription failed (attempt %d/3): %s — retrying in %ds",
                attempt + 1,
                describe_error(exc),
                wait,
            )
            time.sleep(wait)

    raise TranscribeError(f"Transcription failed after retries: {describe_error(last_exc)}") from last_exc


def _is_bad_request(exc: Exception) -> bool:
    """A client-side 4xx (bad/unsupported params), as opposed to a transient 5xx
    or network error worth retrying."""
    code = getattr(exc, "status_code", None)
    return code in (400, 422)


def _parse_response(data: dict) -> STTResult:
    text = (data.get("text") or "").strip()
    if "words" in data:
        return STTResult(text=text, segments=_segments_from_words(data["words"] or []))
    segments: list[STTSegment] = []
    for seg in data.get("segments") or []:
        start = seg.get("start")
        end = seg.get("end")
        seg_text = (seg.get("text") or "").strip()
        if start is None or end is None or not seg_text:
            continue
        segments.append(
            STTSegment(
                text=seg_text,
                start=float(start),
                end=float(end),
                # Mistral labels speakers as `speaker_id`; absent on plain runs.
                speaker=seg.get("speaker_id"),
            )
        )
    return STTResult(text=text, segments=segments)


# ── ElevenLabs Scribe ────────────────────────────────────────────────────────
# Not OpenAI-compatible: its own route, `xi-api-key` header and form fields, and
# word-level output that we group back into sentence segments.

ELEVENLABS_MODELS = ["scribe_v2", "scribe_v1"]
_SENTENCE_END = (".", "?", "!", "…")


def _is_elevenlabs(ep: Endpoint) -> bool:
    return ep.base_url.rstrip("/") == ELEVENLABS_BASE_URL


def _elevenlabs_transcribe(audio, ep: Endpoint, params: dict) -> dict:
    """One Scribe call, taking the same params as the OpenAI path."""
    data = {"model_id": ep.model}
    if params.get("language"):
        data["language_code"] = params["language"]
    if params.get("extra_body", {}).get("diarize"):
        data["diarize"] = "true"
    response = httpx.post(
        f"{ELEVENLABS_BASE_URL}/speech-to-text",
        headers={"xi-api-key": ep.api_key or ""},
        data=data,
        files={"file": audio},
        timeout=settings.stt_timeout_s,
    )
    if response.status_code >= 400:
        raise _HTTPStatus(response.status_code)
    return json.loads(response.text)


def _segments_from_words(words: list[dict]) -> list[STTSegment]:
    """Scribe's words and spacings, cut at each sentence end and speaker change.
    Audio events like "(laughter)" are dropped: they aren't speech."""
    segments: list[STTSegment] = []
    parts: list[str] = []
    start = end = 0.0
    speaker = None

    def flush():
        text = "".join(parts).strip()
        if text:
            segments.append(STTSegment(text=text, start=start, end=end, speaker=speaker))
        parts.clear()

    for w in words:
        kind = w.get("type", "word")
        if kind == "audio_event":
            continue
        if kind == "word":
            if parts and w.get("speaker_id") != speaker:
                flush()
            if not "".join(parts).strip():
                start, speaker = float(w.get("start") or 0.0), w.get("speaker_id")
            end = float(w.get("end") or end)
        parts.append(w.get("text") or "")
        if kind == "word" and parts[-1].rstrip().endswith(_SENTENCE_END):
            flush()
    flush()
    return segments


def list_models(endpoint: Endpoint) -> list[str]:
    """Check a transcription-only provider's key and return its models.

    Scribe has no model listing, so the key is checked against `GET /models`; a
    key scoped to transcription only is refused there with `missing_permissions`
    and still counts as valid. Raises KeyRefused for a rejected key."""
    response = httpx.get(
        f"{ELEVENLABS_BASE_URL}/models",
        headers={"xi-api-key": endpoint.api_key or ""},
        timeout=15,
    )
    if response.status_code in (401, 403) and "missing_permissions" not in response.text:
        raise KeyRefused(f"HTTP {response.status_code}")
    if response.status_code >= 400 and response.status_code not in (401, 403):
        raise _HTTPStatus(response.status_code)
    return list(ELEVENLABS_MODELS)
