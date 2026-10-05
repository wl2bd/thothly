import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request

from app.api.health import router as health_router
from app.api.llm import router as llm_router
from app.api.search import router as search_router
from app.core.database import init_db
from app.core.posthog import (
    get_posthog_client,
    initialize_posthog,
    shutdown_posthog,
)
from app.jobs.repository import reap_orphaned_jobs
from app.jobs.router import router as jobs_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    initialize_posthog()
    init_db()
    # Jobs are in-process (BackgroundTasks); a restart mid-run would otherwise
    # leave them stuck in discovering/processing forever. Fail those on boot.
    reaped = reap_orphaned_jobs()
    if reaped:
        logger.warning("Reaped %d job(s) orphaned by a previous restart", reaped)
    yield
    shutdown_posthog()


app = FastAPI(title="Thothly backend", lifespan=lifespan)


@app.middleware("http")
async def capture_unhandled_exceptions(request: Request, call_next):
    """Send unexpected request failures to PostHog without changing responses."""
    try:
        return await call_next(request)
    except Exception as exc:
        posthog_client = get_posthog_client()
        if posthog_client is not None:
            posthog_client.capture_exception(exc)
        raise


app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(llm_router)
app.include_router(search_router)
