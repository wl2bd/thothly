"""Optional OpenAI-compatible speech-to-text layer.

The audio twin of `pipeline/llm.py`: point `STT_BASE_URL`/`STT_MODEL` (+ an
optional `STT_API_KEY`) at any OpenAI-compatible `audio/transcriptions`
endpoint — Mistral's Voxtral (`voxtral-mini-latest`), a local vLLM or
whisper.cpp server (no key), or OpenAI. When unconfigured, `stt_available()`
is False and podcast episodes are skipped, exactly like a YouTube video that
has no subtitles.

This module transcribes a single audio file that already fits under the
provider's per-request length cap; splitting long episodes into such chunks is
the caller's job (see `app/sources/podcast.py`).
"""

import logging
import time
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class TranscribeError(Exception):
    """A transcription call failed (after retries). Callers skip the episode."""


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


def transcribe_file(path: Path, *, language: str | None = None) -> str:
    """Transcribe one audio file and return its plain text.

    `path` must already be under the provider's per-request length cap. Retries a
    couple of times with backoff on transient errors; raises TranscribeError if
    it still fails so the caller can skip the episode gracefully.
    """
    if not stt_available():
        raise TranscribeError("Speech-to-text is not configured")

    # `language` is an ISO-639-1 hint; omit it rather than pass None/"" so the
    # provider auto-detects when we don't have a preference.
    extra = {"language": language} if language else {}

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with open(path, "rb") as audio:
                response = _client().audio.transcriptions.create(
                    model=settings.stt_model,
                    file=audio,
                    **extra,
                )
            return (getattr(response, "text", "") or "").strip()
        except Exception as exc:  # noqa: BLE001 — provider SDKs raise many types
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
