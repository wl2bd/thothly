import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import FileResponse

from app.jobs import repository
from app.jobs.models import JobConfirm, JobCreate, JobResponse
from app.jobs.phases import run_discovery
from app.jobs.runner import run_compilation

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobResponse)
def create_job(payload: JobCreate, background_tasks: BackgroundTasks) -> JobResponse:
    job = repository.create_job(payload)
    background_tasks.add_task(run_discovery, job.id, payload.sources)
    return job


@router.get("", response_model=list[JobResponse])
def list_jobs() -> list[JobResponse]:
    return repository.list_jobs()


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.post("/{job_id}/confirm", response_model=JobResponse)
def confirm_job(
    job_id: str, payload: JobConfirm, background_tasks: BackgroundTasks
) -> JobResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.status != "reviewing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is not awaiting review (status: {job.status})",
        )

    selected = repository.confirm_items(job_id, payload.selected_ids)
    if not selected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="None of the selected ids match discovered items",
        )

    repository.update_job_status(job_id, "processing")
    background_tasks.add_task(run_compilation, job_id)
    return repository.get_job(job_id)


@router.get("/{job_id}/download")
def download_job(job_id: str) -> FileResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.status != "completed" or not job.output_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="EPUB is not ready"
        )

    path = Path(job.output_path)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="EPUB file is missing"
        )

    return FileResponse(
        path,
        media_type="application/epub+zip",
        filename=_download_filename(job),
    )


def _download_filename(job: JobResponse) -> str:
    base = job.book_title or "thothly"
    slug = re.sub(r"[^\w\-]+", "-", base).strip("-").lower()
    return f"{slug or 'thothly'}.epub"
