"""Starting a job's phases, whichever front door asks: the web API or the CLI."""

from collections import Counter

from app.core.config import settings
from app.core.posthog import capture
from app.jobs import credentials, repository
from app.jobs.models import DiscoveredItemResponse, JobConfirm, VisitorEndpoint
from app.pipeline.providers import Endpoint, resolve_endpoint
from app.pipeline.roles import get_role
from app.sources import youtube
from app.sources.discovery import apply_transcript_stats


class NothingSelected(Exception):
    """None of the chosen items belong to the job anymore."""


class LanguageNotOffered(Exception):
    """The item can't be read in that language (or it had no track there)."""


class ReviewOver(Exception):
    """The job left review while the language was being fetched."""


def choose_language(job_id: str, item: DiscoveredItemResponse, language: str) -> DiscoveredItemResponse:
    """Switch a video to another of its caption languages, at review.

    Picking the default (first) option goes back to the default track. The
    transcript is fetched now, so the row's language, length and punctuation are
    right before the preview reloads; it is cached, so the compile reuses it.
    Raises LanguageNotOffered, ReviewOver when the compile started meanwhile, or
    YouTubeUnavailable when YouTube refuses."""
    offered = [o.language for o in item.transcript_tracks]
    if language not in offered:
        raise LanguageNotOffered
    choice = None if language == offered[0] else language
    transcript = youtube.load_transcript(youtube.video_id(item.url), choice)
    if transcript is None:
        raise LanguageNotOffered
    tracks = item.transcript_tracks
    apply_transcript_stats(item, transcript)
    item.transcript_tracks = tracks
    item.transcript_choice = choice
    if not repository.save_reviewed_item(job_id, item):
        raise ReviewOver
    return item


def confirm(job_id: str, choice: JobConfirm) -> list[DiscoveredItemResponse]:
    """Record the visitor's picks and settings and move the job to processing.

    The caller then runs `run_compilation(job_id)`. Raises ProviderRejected (the
    visitor named a provider the server won't call) before anything about the
    job changes, and NothingSelected when no chosen item is the job's.
    """
    llm = _visitor_endpoint(choice.llm, for_stt=False)
    stt = _visitor_endpoint(choice.stt, for_stt=True)

    selected = repository.confirm_items(job_id, choice.selected_ids)
    if not selected:
        raise NothingSelected

    roles = [r for r in choice.llm_roles if get_role(r) is not None]
    repository.set_job_llm_roles(job_id, roles)
    # Attribute the book to the model that writes it, the visitor's or the
    # server's, and only when a role engages one. The id alone, never the key.
    if roles:
        model = f"{choice.llm.provider}/{choice.llm.model}" if choice.llm else settings.llm_model
    else:
        model = None
    repository.set_job_llm_model(job_id, model)

    title = choice.book_title.strip() if choice.book_title else None
    # A blank title keeps the default discovery derived.
    repository.update_job_status(job_id, "processing", book_title=title or None)
    credentials.put(job_id, credentials.JobCredentials(llm=llm, stt=stt))
    capture(
        "job_confirmed",
        {
            "selected_item_count": len(selected),
            "source_types": dict(Counter(item.item_type for item in selected)),
            "llm_role_count": len(roles),
            "uses_visitor_llm": llm is not None,
            "uses_visitor_stt": stt is not None,
        },
        job_id,
    )
    return selected


def _visitor_endpoint(sent: VisitorEndpoint | None, *, for_stt: bool) -> Endpoint | None:
    if sent is None:
        return None
    return resolve_endpoint(
        sent.provider,
        api_key=sent.api_key.get_secret_value() if sent.api_key else None,
        model=sent.model,
        base_url=sent.base_url,
        for_stt=for_stt,
    )
