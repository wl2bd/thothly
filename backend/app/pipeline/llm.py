"""Optional OpenAI-compatible LLM client.

A single provider-agnostic client: point `LLM_BASE_URL`/`LLM_MODEL` (+ an
optional `LLM_API_KEY`) at any OpenAI-compatible endpoint — Ollama (local,
no key), Mistral, OpenAI, OpenRouter. When unconfigured, `llm_available()`
is False and the rest of the app stays on the free zero-LLM path.
"""

import logging
import time

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """A cleanup-pass LLM call failed (after retries). Callers fall back."""


def llm_available() -> bool:
    """True when an LLM endpoint is configured (model + base URL)."""
    return bool(settings.llm_base_url and settings.llm_model)


def _client():
    """Build the OpenAI SDK client lazily so `openai` is only imported/needed
    when an LLM is actually configured."""
    from openai import OpenAI

    return OpenAI(
        base_url=settings.llm_base_url,
        # Some local servers (Ollama) need no key; the SDK still wants a value.
        api_key=settings.llm_api_key or "not-needed",
        timeout=settings.llm_timeout_s,
    )


def complete(system: str, user: str, *, max_tokens: int = 4096) -> str:
    """Run one chat completion and return the assistant text.

    Deterministic (temperature 0) since every role is a faithful transform, not
    creative writing. Retries a couple of times with backoff on transient errors;
    raises LLMError if it still fails so the caller can fall back gracefully.
    """
    if not llm_available():
        raise LLMError("LLM is not configured")

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = _client().chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0,
                max_tokens=max_tokens,
            )
            return (response.choices[0].message.content or "").strip()
        except Exception as exc:  # noqa: BLE001 — provider SDKs raise many types
            last_exc = exc
            wait = 2**attempt
            logger.warning(
                "LLM call failed (attempt %d/3): %s — retrying in %ds",
                attempt + 1,
                exc,
                wait,
            )
            time.sleep(wait)

    raise LLMError(f"LLM call failed after retries: {last_exc}") from last_exc
