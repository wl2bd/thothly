import json
import uuid
from datetime import datetime, timezone

from app.core.database import get_connection
from app.jobs.models import JobCreate, JobResponse, Source


def create_job(payload: JobCreate) -> JobResponse:
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    sources_json = json.dumps([s.model_dump(mode="json") for s in payload.sources])

    with get_connection() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, sources, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (job_id, "pending", sources_json, now_iso, now_iso),
        )
        conn.commit()

    return JobResponse(
        id=job_id,
        status="pending",
        sources=payload.sources,
        created_at=now,
        updated_at=now,
    )


def get_job(job_id: str) -> JobResponse | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()

    if row is None:
        return None

    sources = [Source(**s) for s in json.loads(row["sources"])]
    return JobResponse(
        id=row["id"],
        status=row["status"],
        sources=sources,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
