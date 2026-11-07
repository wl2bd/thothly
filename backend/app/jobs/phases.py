import logging

from app.jobs.chapters import YOUTUBE_BUSY
from app.jobs.models import DiscoveredItemResponse, Source
from app.jobs.repository import (
    save_discovered_items,
    set_job_sources,
    update_job_status,
)
from app.pipeline.compiler import derive_book_title
from app.search.triage import MAX_JUDGED_ITEMS, describe, judge_items, triage_enabled
from app.sources.discovery import discover_source
from app.sources.models import DiscoveredItem
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)


def run_discovery(
    job_id: str, sources: list[Source], book_title: str | None = None
) -> None:
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
        refused = 0
        for index, source in enumerate(sources):
            try:
                source_name, discovered = discover_source(source, index)
            except YouTubeUnavailable:
                logger.exception("Source %d of job %s: YouTube refused", index, job_id)
                source_name, discovered = None, []
                source.error = YOUTUBE_BUSY
                refused += 1
            except Exception:
                # The raw exception stays in the log; the source gets one line.
                logger.exception("Source %d of job %s couldn't be read", index, job_id)
                source_name, discovered = None, []
                source.error = "Couldn't be read."
            _set_aside_doubtful(discovered, source_name, source.query)
            source_names.append(source_name)
            items.extend(
                DiscoveredItemResponse(id=f"{job_id}-{d.source_index}-{d.item_index}", **d.model_dump())
                for d in discovered
            )

            # Written back source by source, so the loading screen shows each one
            # flip from scanning to done instead of one spinner for the batch.
            source.name = source_name
            source.item_count = len(discovered)
            source.resolved = True
            set_job_sources(job_id, sources)

        if not items:
            errors = {s.error for s in sources}
            if refused == len(sources):
                error = YOUTUBE_BUSY
            elif None in errors:
                error = "Those sources had no content to compile."
            else:
                error = "Those sources couldn't be read. Try again."
            update_job_status(job_id, "failed", error=error)
            return

        save_discovered_items(job_id, items)
        update_job_status(
            job_id,
            "reviewing",
            book_title=book_title or derive_book_title(source_names),
        )
        logger.info("Discovery done for job %s: %d items", job_id, len(items))

    except Exception:
        # The raw exception (yt-dlp text, a blocked-URL guard, a network error)
        # stays in the log; the user gets one calm, written line instead.
        logger.exception("Discovery failed for job %s", job_id)
        update_job_status(
            job_id,
            "failed",
            error="Those sources couldn't be read. Try again.",
        )


# How the judge names each kind of item.
_JUDGED_KIND = {"youtube": "video", "podcast": "episode", "blog": "web"}


def _set_aside_doubtful(
    items: list[DiscoveredItem], source_name: str | None, query: str | None
) -> None:
    """Mark the items of a channel, feed or homepage the search triage doubts.

    A single item was picked on purpose, so it is never second-guessed. Nothing
    is removed: a doubted item only starts unchecked, with its reason shown.
    """
    if len(items) < 2 or not triage_enabled():
        return
    judged = items[:MAX_JUDGED_ITEMS]
    described = [
        describe(_JUDGED_KIND[d.item_type], d.title, source_name, d.estimated_duration_s)
        for d in judged
    ]
    for i, reason in judge_items(query, described).items():
        judged[i].set_aside = reason
