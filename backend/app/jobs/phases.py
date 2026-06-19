import logging

from app.jobs.models import DiscoveredItemResponse, Source
from app.jobs.repository import save_discovered_items, update_job_status
from app.pipeline.compiler import derive_book_title
from app.sources.discovery import discover_source

logger = logging.getLogger(__name__)


def run_discovery(job_id: str, sources: list[Source]) -> None:
    """Background phase: list what each source contains, then await review.

    Discovery stays light — it only enumerates items (video/article metadata).
    The expensive per-item work (fetching subtitles, scraping articles) is
    deferred to compilation and runs only for the items the user selects.
    It also captures each source's name to seed a default book title.
    """
    logger.info("Discovery starting for job %s (%d sources)", job_id, len(sources))
    try:
        items: list[DiscoveredItemResponse] = []
        source_names: list[str | None] = []
        for index, source in enumerate(sources):
            source_name, discovered = discover_source(
                str(source.url), index, kind=source.kind, title=source.title
            )
            source_names.append(source_name)
            items.extend(
                DiscoveredItemResponse(
                    id=f"{job_id}-{d.source_index}-{d.item_index}",
                    source_index=d.source_index,
                    item_index=d.item_index,
                    item_type=d.item_type,
                    title=d.title,
                    url=d.url,
                    estimated_duration_s=d.estimated_duration_s,
                    estimated_size_chars=d.estimated_size_chars,
                    preview_html=d.preview_html,
                    has_transcript=d.has_transcript,
                    transcript_lang=d.transcript_lang,
                    is_punctuated=d.is_punctuated,
                    word_count=d.word_count,
                    reading_time_min=d.reading_time_min,
                )
                for d in discovered
            )

        if not items:
            update_job_status(job_id, "failed", error="No items discovered from any source")
            return

        save_discovered_items(job_id, items)
        update_job_status(
            job_id, "reviewing", book_title=derive_book_title(source_names)
        )
        logger.info("Discovery done for job %s: %d items", job_id, len(items))

    except Exception as exc:
        logger.exception("Discovery failed for job %s", job_id)
        update_job_status(job_id, "failed", error=str(exc))
