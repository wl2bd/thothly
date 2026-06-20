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

from app.core.config import settings

logger = logging.getLogger(__name__)


class TranscribeError(Exception):
    """A transcription call failed (after retries). Callers skip the episode."""


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


def stt_available() -> bool:
    """True when a speech-to-text endpoint is configured (model + base URL)."""
    return bool(settings.stt_base_url and settings.stt_model)


def _client():
    """Build the OpenAI SDK client lazily so `openai` is only imported when an
    STT endpoint is actually configured."""
    from openai import OpenAI

    return OpenAI(
        base_url=settings.stt_base_url,
        # Local servers (vLLM, whisper.cpp) need no key; the SDK still wants one.
        api_key=settings.stt_api_key or "not-needed",
        timeout=settings.stt_timeout_s,
    )


def transcribe_file(
    path: Path, *, language: str | None = None, diarize: bool | None = None
) -> STTResult:
    """Transcribe one audio file into an STTResult.

    `path` must already be under the provider's per-request length cap. We first
    ask for segment timestamps + diarization; if the endpoint rejects those, we
    fall back to a plain request. Transient errors are retried with backoff;
    TranscribeError is raised only when nothing works, so the caller can skip
    the episode gracefully.
    """
    if not stt_available():
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
            data = _request_with_retries(path, {**base, **params})
        except _UnsupportedParams as exc:
            logger.info("STT endpoint rejected extras %s; retrying simpler", list(params))
            last_exc = exc
            continue
        return _parse_response(data)

    raise TranscribeError(f"Transcription failed: {last_exc}")


def _request_with_retries(path: Path, params: dict) -> dict:
    """One transcription call (raw JSON), retried on transient errors.

    Uses `with_raw_response` so we read the provider's full JSON body — the
    typed SDK model drops provider extras like `speaker_id`. A 4xx is raised as
    `_UnsupportedParams` (don't retry; the caller drops the extras instead)."""
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with open(path, "rb") as audio:
                raw = _client().audio.transcriptions.with_raw_response.create(
                    model=settings.stt_model,
                    file=audio,
                    **params,
                )
            return json.loads(raw.text)
        except Exception as exc:  # noqa: BLE001 — provider SDKs raise many types
            if _is_bad_request(exc):
                raise _UnsupportedParams(str(exc)) from exc
            last_exc = exc
            wait = 2**attempt
            logger.warning(
                "Transcription failed (attempt %d/3): %s — retrying in %ds",
                attempt + 1,
                exc,
                wait,
            )
            time.sleep(wait)

    raise TranscribeError(f"Transcription failed after retries: {last_exc}") from last_exc


def _is_bad_request(exc: Exception) -> bool:
    """A client-side 4xx (bad/unsupported params), as opposed to a transient 5xx
    or network error worth retrying."""
    code = getattr(exc, "status_code", None)
    return code in (400, 422)


def _parse_response(data: dict) -> STTResult:
    text = (data.get("text") or "").strip()
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
