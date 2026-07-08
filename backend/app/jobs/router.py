import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import FileResponse

from app.jobs import repository
from app.jobs.models import ItemPreview, JobConfirm, JobCreate, JobResponse
from app.jobs.phases import run_discovery
from app.jobs.preview import build_item_preview
from app.jobs.runner import run_compilation
from app.pipeline.roles import get_role

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")
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

    selected = repository.confirm_items(job_id, payload.selected_ids)
    if not selected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Those items are no longer available. Go back and choose again.",
        )

    # Keep only known role ids; the compile only acts on them when an LLM is
    # actually configured (otherwise they are ignored — the free path).
    valid_roles = [r for r in payload.llm_roles if get_role(r) is not None]
    repository.set_job_llm_roles(job_id, valid_roles)

    # A blank title keeps the discovery-derived default (book_title=None leaves
    # the stored value untouched).
    title = payload.book_title.strip() if payload.book_title else None
    repository.update_job_status(job_id, "processing", book_title=title or None)
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
def download_job(job_id: str, format: str = "epub") -> FileResponse:
    """Download the finished compilation.

    `format=epub` (default) returns the EPUB; `format=md` returns the standalone
    Markdown twin (the zero-LLM, AI-friendly text of the same content).
    """
    if format not in ("epub", "md"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That format isn't supported. Choose EPUB or Markdown.",
        )

    job = repository.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That compilation doesn't exist.")

    stored_path = job.output_md_path if format == "md" else job.output_path
    label = "Markdown" if format == "md" else "EPUB"
    if job.status != "completed" or not stored_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The {label} isn't ready yet.",
        )

    path = Path(stored_path)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"The {label} file is missing.",
        )

    media_type = "text/markdown" if format == "md" else "application/epub+zip"
    return FileResponse(
        path,
        media_type=media_type,
        filename=_download_filename(job, format),
    )


def _download_filename(job: JobResponse, ext: str) -> str:
    base = job.book_title or "thothly"
    slug = re.sub(r"[^\w\-]+", "-", base).strip("-").lower()
    return f"{slug or 'thothly'}.{ext}"
