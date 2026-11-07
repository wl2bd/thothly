import re

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import FileResponse

from app.core.posthog import capture
from app.jobs import repository, service
from app.jobs.models import ItemPreview, JobConfirm, JobCreate, JobResponse
from app.jobs.outputs import FORMATS, OutputFormat, output_file
from app.jobs.phases import run_discovery
from app.jobs.preview import build_item_preview
from app.jobs.runner import run_compilation
from app.pipeline.providers import ProviderRejected

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobResponse)
def create_job(payload: JobCreate, background_tasks: BackgroundTasks) -> JobResponse:
    job = repository.create_job(payload)
    capture("job_created", {"source_count": len(payload.sources)}, job.id)
    background_tasks.add_task(run_discovery, job.id, job.sources, job.book_title)
    return job


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")
    return job


@router.post("/{job_id}/stop", response_model=JobResponse)
def stop_job(job_id: str) -> JobResponse:
    """Stop a running compile before its next item or AI call; the book keeps
    what's ready."""
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")
    if job.status != "processing":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This compilation isn't running.")
    repository.request_stop(job_id)
    return job


@router.post("/{job_id}/confirm", response_model=JobResponse)
def confirm_job(
    job_id: str, payload: JobConfirm, background_tasks: BackgroundTasks
) -> JobResponse:
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")
    if job.status != "reviewing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This compilation isn't awaiting review anymore.",
        )

    try:
        service.confirm(job_id, payload)
    except ProviderRejected as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except service.NothingSelected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Those items are no longer available. Go back and choose again.",
        ) from None
    background_tasks.add_task(run_compilation, job_id)
    return repository.get_job(job_id)


@router.get("/{job_id}/items/{item_id}/preview", response_model=ItemPreview)
def preview_item(job_id: str, item_id: str) -> ItemPreview:
    """The no-LLM content this item would contribute, for the review screen.

    Lets the user see what they're keeping before compiling — the exact
    zero-LLM render (free/instant for cached YouTube transcripts, one cheap
    scrape for blogs; podcasts report that they need transcription first).
    """
    if repository.get_job(job_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")
    item = repository.get_discovered_item(job_id, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That item doesn't exist.")
    return build_item_preview(item)


@router.get("/{job_id}/download")
def download_job(job_id: str, format: OutputFormat = "epub") -> FileResponse:
    """The finished compilation, as EPUB or as plain Markdown."""
    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")

    label, media_type = FORMATS[format]
    if job.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {label} isn't ready yet.",
        )
    path = output_file(job_id, format)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"The {label} file is missing.",
        )

    capture("compilation_downloaded", {"output_format": format}, job_id)
    return FileResponse(path, media_type=media_type, filename=_download_filename(job, format))


def _download_filename(job: JobResponse, ext: str) -> str:
    base = job.book_title or "thothly"
    slug = re.sub(r"[^\w\-]+", "-", base).strip("-").lower()
    return f"{slug or 'thothly'}.{ext}"
