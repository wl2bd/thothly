import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.llm import router as llm_router
from app.api.search import router as search_router
from app.core.database import init_db
from app.jobs.repository import reap_orphaned_jobs
from app.jobs.router import router as jobs_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    # Jobs are in-process (BackgroundTasks); a restart mid-run would otherwise
    # leave them stuck in discovering/processing forever. Fail those on boot.
    reaped = reap_orphaned_jobs()
    if reaped:
        logger.warning("Reaped %d job(s) orphaned by a previous restart", reaped)
    yield


app = FastAPI(title="Thothly backend", lifespan=lifespan)
app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(llm_router)
app.include_router(search_router)
