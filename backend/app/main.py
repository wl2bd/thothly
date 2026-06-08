from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.llm import router as llm_router
from app.core.database import init_db
from app.jobs.router import router as jobs_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield


app = FastAPI(title="Thothly backend", lifespan=lifespan)
app.include_router(health_router)
app.include_router(jobs_router)
app.include_router(llm_router)
