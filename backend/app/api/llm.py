import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, SecretStr

from app.core.config import settings
from app.pipeline.llm import KeyRefused, list_models, llm_available
from app.pipeline.providers import PROVIDERS, ProviderRejected, get_provider, resolve_endpoint
from app.pipeline.roles import ROLES
from app.pipeline.transcribe import stt_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm", tags=["llm"])


class RoleInfo(BaseModel):
    id: str
    label: str
    description: str
    scope: str
    tier: str  # "auto" | "default" | "extra" — see app/pipeline/roles.py
    # Shown to the user when they connect their own key: it is their model and
    # their money, so they see exactly what it is told to do.
    system_prompt: str


class Pricing(BaseModel):
    """Approximate provider rates (USD) for the review screen's cost estimate.
    Informational only — Thothly never bills anything."""

    stt_per_minute: float
    llm_per_mtok_in: float
    llm_per_mtok_out: float


class ProviderInfo(BaseModel):
    """An allowlisted provider for the connect dialog. No base URL: the browser
    names a provider and the server alone knows where it lives."""

    id: str
    label: str
    llm_per_mtok_in: float
    llm_per_mtok_out: float
    stt_per_minute: float | None  # None = this provider can't transcribe


class LLMConfig(BaseModel):
    # Server-side meaning only: whether THIS server has its own key. The
    # frontend ORs it with a key the browser holds.
    available: bool
    stt_available: bool
    roles: list[RoleInfo]
    pricing: Pricing
    providers: list[ProviderInfo]
    custom_base_url_allowed: bool


class VerifyRequest(BaseModel):
    provider: str
    api_key: SecretStr | None = None
    base_url: str | None = None  # read only for "custom", when the server allows it


class VerifyResponse(BaseModel):
    models: list[str]


@router.get("", response_model=LLMConfig)
def get_llm_config() -> LLMConfig:
    """Tell the review screen which AI passes are configured and what they cost.

    `available`/`stt_available` are False when no endpoint is set; the frontend
    then shows the roles disabled and skips that part of the estimate. The role
    catalogue is the single source of truth from app/pipeline/roles.py; pricing
    comes from config so a self-hoster can match their provider.
    """
    return LLMConfig(
        available=llm_available(),
        stt_available=stt_available(),
        roles=[
            RoleInfo(
                id=r.id,
                label=r.label,
                description=r.description,
                scope=r.scope,
                tier=r.tier,
                system_prompt=r.system_prompt,
            )
            for r in ROLES
        ],
        pricing=Pricing(
            stt_per_minute=settings.stt_price_per_minute,
            llm_per_mtok_in=settings.llm_price_per_mtok_in,
            llm_per_mtok_out=settings.llm_price_per_mtok_out,
        ),
        providers=[
            ProviderInfo(
                id=p.id,
                label=p.label,
                llm_per_mtok_in=p.llm_per_mtok_in,
                llm_per_mtok_out=p.llm_per_mtok_out,
                stt_per_minute=p.stt_per_minute,
            )
            for p in PROVIDERS
        ],
        custom_base_url_allowed=settings.byok_allow_custom_base_url,
    )


@router.post("/verify", response_model=VerifyResponse)
def verify_key(payload: VerifyRequest) -> VerifyResponse:
    """Check a visitor's key and list the models it grants, before they save it.

    Goes through the backend because providers don't allow browser calls
    (CORS), and only ever to an allowlisted provider's own URL. The key is used
    for this one call and never stored or echoed.
    """
    api_key = payload.api_key.get_secret_value() if payload.api_key else None
    try:
        endpoint = resolve_endpoint(
            payload.provider,
            api_key=api_key,
            model="",
            base_url=payload.base_url,
            require_model=False,
        )
    except ProviderRejected as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    provider = get_provider(payload.provider)
    name = provider.label if provider else "your server"
    try:
        models = list_models(endpoint)
    except KeyRefused as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"{name} refused that key. Check it and try again."
        ) from exc
    except Exception as exc:  # noqa: BLE001 — network, DNS, 5xx: all "couldn't reach"
        logger.warning("Model listing failed for provider %s: %s", payload.provider, type(exc).__name__)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Couldn't reach {name}. Try again in a moment."
        ) from exc
    return VerifyResponse(models=sorted(models))
