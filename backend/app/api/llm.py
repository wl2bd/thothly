from fastapi import APIRouter
from pydantic import BaseModel

from app.pipeline.llm import llm_available
from app.pipeline.roles import ROLES

router = APIRouter(prefix="/llm", tags=["llm"])


class RoleInfo(BaseModel):
    id: str
    label: str
    description: str
    scope: str


class LLMConfig(BaseModel):
    available: bool
    roles: list[RoleInfo]


@router.get("", response_model=LLMConfig)
def get_llm_config() -> LLMConfig:
    """Tell the review screen whether an LLM is configured and which roles exist.

    `available` is False when no endpoint is set in the environment; the frontend
    then shows the role list disabled. The role catalogue is the single source of
    truth from app/pipeline/roles.py.
    """
    return LLMConfig(
        available=llm_available(),
        roles=[
            RoleInfo(id=r.id, label=r.label, description=r.description, scope=r.scope)
            for r in ROLES
        ],
    )
