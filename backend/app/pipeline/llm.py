"""Optional OpenAI-compatible LLM client.

A single provider-agnostic client: point `LLM_BASE_URL`/`LLM_MODEL` (+ an
optional `LLM_API_KEY`) at any OpenAI-compatible endpoint — Ollama (local,
no key), Mistral, OpenAI, OpenRouter. When unconfigured, `llm_available()`
is False and the rest of the app stays on the free zero-LLM path.
"""

import logging
import time

from app.core.config import settings
from app.pipeline.providers import Endpoint, describe_error

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """A cleanup-pass LLM call failed (after retries). Callers fall back."""


class KeyRefused(Exception):
    """The provider rejected the key (401/403) while listing models."""


def llm_endpoint(endpoint: Endpoint | None = None) -> Endpoint | None:
    """The endpoint a call should use: the visitor's when one was supplied, else
    the server's own config, else None (the free path)."""
    if endpoint is not None:
        return endpoint
    if settings.llm_base_url and settings.llm_model:
        return Endpoint(settings.llm_base_url, settings.llm_model, settings.llm_api_key)
    return None


def llm_available(endpoint: Endpoint | None = None) -> bool:
    """True when a call would have an endpoint to go to."""
    return llm_endpoint(endpoint) is not None


def _client(endpoint: Endpoint, timeout: float, **kwargs):
    """Build the OpenAI SDK client lazily so `openai` is only imported/needed
    when an LLM is actually configured."""
    from openai import OpenAI

    return OpenAI(
        base_url=endpoint.base_url,
        # Some local servers (Ollama) need no key; the SDK still wants a value.
        api_key=endpoint.api_key or "not-needed",
        timeout=timeout,
        **kwargs,
    )


def list_models(endpoint: Endpoint) -> list[str]:
    """The model ids this key grants (`GET /models`), checking the key on the way.

    One try, short timeout: this runs while the visitor waits on a dialog.
    Raises KeyRefused for a rejected key; anything else propagates as-is.
    """
    from openai import AuthenticationError, PermissionDeniedError

    try:
        page = _client(endpoint, 15, max_retries=0).models.list()
    except (AuthenticationError, PermissionDeniedError) as exc:
        raise KeyRefused(str(exc)) from exc
    return [m.id for m in page]


def complete(
    system: str, user: str, *, max_tokens: int = 4096, endpoint: Endpoint | None = None
) -> str:
    """Run one chat completion and return the assistant text.

    Deterministic (temperature 0) since every role is a faithful transform, not
    creative writing. Retries a couple of times with backoff on transient errors;
    raises LLMError if it still fails so the caller can fall back gracefully.
    """
    ep = llm_endpoint(endpoint)
    if ep is None:
        raise LLMError("LLM is not configured")

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = _client(ep, settings.llm_timeout_s).chat.completions.create(
                model=ep.model,
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
                describe_error(exc),
                wait,
            )
            time.sleep(wait)

    raise LLMError(f"LLM call failed after retries: {describe_error(last_exc)}") from last_exc
