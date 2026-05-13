from fastapi import APIRouter, HTTPException, status

from app.jobs import repository
from app.jobs.models import JobCreate, JobResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobResponse)
def create_job(payload: JobCreate) -> JobResponse:
    return repository.create_job(payload)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job
