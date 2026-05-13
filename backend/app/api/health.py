from fastapi import APIRouter

from app.core.version import APP_VERSION

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": APP_VERSION}
