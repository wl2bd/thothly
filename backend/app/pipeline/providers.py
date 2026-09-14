"""The providers a visitor may bring a key for, and the endpoint they resolve to.

On the public demo the server makes the HTTP call a visitor's key authorises,
so the destination can never come from the visitor: a free-form base URL would
let a stranger aim the server at its own network (SSRF). A request names a
provider id and the base URL is looked up here. Only a self-hoster can open a
free-form URL, with `BYOK_ALLOW_CUSTOM_BASE_URL`, for their own Ollama or vLLM.

Each entry also carries the provider's rates, so the review screen's cost
estimate quotes what the visitor will pay rather than the operator's config.
"""

from dataclasses import dataclass, field
from urllib.parse import urlsplit

from app.core.config import settings

CUSTOM = "custom"


class ProviderRejected(ValueError):
    """The request named a provider or URL the server won't call. The message is
    user-facing."""


@dataclass(frozen=True)
class Endpoint:
    """One OpenAI-compatible endpoint: where to call, which model, with what key.
    Frozen so it can cross into worker threads as a plain argument."""

    base_url: str
    model: str
    api_key: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class Provider:
    id: str
    label: str
    base_url: str
    # Approximate USD rates for a typical small model on this provider, for the
    # estimate only. `stt_per_minute` None = no transcription endpoint here.
    llm_per_mtok_in: float
    llm_per_mtok_out: float
    stt_per_minute: float | None = None


PROVIDERS: tuple[Provider, ...] = (
    Provider("openai", "OpenAI", "https://api.openai.com/v1", 0.15, 0.60, 0.006),
    Provider("mistral", "Mistral", "https://api.mistral.ai/v1", 0.20, 0.60, 0.003),
    Provider("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", 0.15, 0.60),
    Provider("groq", "Groq", "https://api.groq.com/openai/v1", 0.05, 0.08, 0.0007),
    Provider("together", "Together", "https://api.together.xyz/v1", 0.18, 0.18),
)

_BY_ID = {p.id: p for p in PROVIDERS}


def get_provider(provider_id: str) -> Provider | None:
    return _BY_ID.get(provider_id)


def resolve_endpoint(
    provider_id: str,
    *,
    api_key: str | None,
    model: str,
    base_url: str | None = None,
    for_stt: bool = False,
    require_model: bool = True,
) -> Endpoint:
    """Turn what the browser sent into an endpoint the server may call, or raise
    ProviderRejected. `require_model=False` is for listing a key's models."""
    model = model.strip()
    if require_model and not model:
        raise ProviderRejected("Choose a model.")
    if provider_id == CUSTOM:
        return Endpoint(_custom_base_url(base_url), model, api_key or None)

    provider = get_provider(provider_id)
    if provider is None:
        raise ProviderRejected("That provider isn't supported.")
    if for_stt and provider.stt_per_minute is None:
        raise ProviderRejected(f"{provider.label} doesn't offer transcription.")
    if not api_key:
        raise ProviderRejected(f"Add your {provider.label} API key.")
    # A supplied base_url is ignored on purpose: the provider fixes the host.
    return Endpoint(provider.base_url, model, api_key)


def _custom_base_url(base_url: str | None) -> str:
    if not settings.byok_allow_custom_base_url:
        raise ProviderRejected("That provider isn't supported.")
    parts = urlsplit(base_url or "")
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ProviderRejected("Enter a full http(s) address for your server.")
    return base_url.rstrip("/")
