"""Optional OpenAI-compatible LLM client.

A single provider-agnostic client: point `LLM_BASE_URL`/`LLM_MODEL` (+ an
optional `LLM_API_KEY`) at any OpenAI-compatible endpoint — Ollama (local,
no key), Mistral, OpenAI, OpenRouter. When unconfigured, `llm_available()`
is False and the rest of the app stays on the free zero-LLM path.
"""

import logging
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.pipeline.providers import (
    Endpoint,
    KeyRefused,
    describe_error,
    openai_client,
    with_retries,
)

logger = logging.getLogger(__name__)


class LLMError(Exception):
    """A cleanup-pass LLM call failed (after retries). Callers fall back."""


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


def extra_body(endpoint: Endpoint) -> dict:
    """Request fields only OpenRouter understands. Every call here is a faithful
    transform or a closed question, where a reasoning pass only costs time and
    tokens: measured on DeepSeek V4.1 Flash, it spent a cleanup chunk's whole
    output budget thinking and returned an empty text. Another provider would
    reject the unknown field, so it is sent to OpenRouter alone."""
    if urlsplit(endpoint.base_url).hostname == "openrouter.ai":
        return {"reasoning": {"enabled": False}}
    return {}


def call_cost(response) -> float | None:
    """The USD cost OpenRouter reports in the response's usage, or None when
    the provider doesn't report one."""
    usage = getattr(response, "usage", None)
    cost = (getattr(usage, "model_extra", None) or {}).get("cost")
    return float(cost) if isinstance(cost, (int, float)) else None


def list_models(endpoint: Endpoint) -> list[str]:
    """The model ids this key grants (`GET /models`), checking the key on the way.

    One try, short timeout: this runs while the visitor waits on a dialog.
    Raises KeyRefused for a rejected key; anything else propagates as-is.
    """
    from openai import AuthenticationError, PermissionDeniedError

    try:
        page = openai_client(endpoint, 15, max_retries=0).models.list()
    except (AuthenticationError, PermissionDeniedError) as exc:
        raise KeyRefused(str(exc)) from exc
    return [m.id for m in page]


def complete(
    system: str, user: str, *, max_tokens: int = 4096, endpoint: Endpoint | None = None
) -> str:
    """Run one chat completion and return the assistant text.

    Deterministic (temperature 0) since every role is a faithful transform, not
    creative writing. Raises LLMError once retries fail, so the caller falls back.
    """
    ep = llm_endpoint(endpoint)
    if ep is None:
        raise LLMError("LLM is not configured")

    def call() -> str:
        response = openai_client(ep, settings.llm_timeout_s).chat.completions.create(
            model=ep.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            max_tokens=max_tokens,
            extra_body=extra_body(ep),
        )
        cost = call_cost(response)
        # The operator's own key only: a visitor's spend is on their invoice.
        if endpoint is None and cost is not None:
            capture_paid_call("openrouter", "llm", cost)
        return (response.choices[0].message.content or "").strip()

    try:
        return with_retries(call, "LLM call")
    except Exception as exc:  # noqa: BLE001 — provider SDKs raise many types
        raise LLMError(f"LLM call failed after retries: {describe_error(exc)}") from exc
