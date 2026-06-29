from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.pipeline.llm import llm_available
from app.pipeline.roles import ROLES
from app.pipeline.transcribe import stt_available

router = APIRouter(prefix="/llm", tags=["llm"])


class RoleInfo(BaseModel):
    id: str
    label: str
    description: str
    scope: str
    tier: str  # "auto" | "default" | "extra" — see app/pipeline/roles.py


class Pricing(BaseModel):
    """Approximate provider rates (USD) for the review screen's cost estimate.
    Informational only — Thothly never bills anything."""

    stt_per_minute: float
    llm_per_mtok_in: float
    llm_per_mtok_out: float


class LLMConfig(BaseModel):
    available: bool
    stt_available: bool
    roles: list[RoleInfo]
    pricing: Pricing


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
            )
            for r in ROLES
        ],
        pricing=Pricing(
            stt_per_minute=settings.stt_price_per_minute,
            llm_per_mtok_in=settings.llm_price_per_mtok_in,
            llm_per_mtok_out=settings.llm_price_per_mtok_out,
        ),
    )
