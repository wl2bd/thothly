import logging
import time
from collections import Counter

from app.core.posthog import capture
from app.jobs import credentials
from app.jobs.chapters import YOUTUBE_BUSY, ItemSkipped, draft, polish
from app.jobs.models import DiscoveredItemResponse
from app.jobs.outputs import output_file
from app.jobs.repository import (
    get_job,
    get_job_llm_roles,
    get_selected_items,
    set_item_compile_state,
    stop_requested,
    update_job_status,
)
from app.pipeline.cleanup import CompileStopped, generate_preface
from app.pipeline.compiler import CompilationError, compile_book
from app.pipeline.llm import llm_endpoint
from app.pipeline.models import CompiledBook, CompiledChapter
from app.pipeline.providers import Endpoint
from app.pipeline.roles import PREFACE
from app.render.epub import render_epub
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)

YOUTUBE_RATE_LIMITED = "YouTube rate-limited this request."
ITEM_FAILED = "This item could not be built."
STOPPED = "Stopped before this item."
STOPPED_EMPTY = "Compilation stopped before any chapter was ready."
NOTHING_BUILT = "None of the selected items could be built. Try again, or pick different sources."


def run_compilation(job_id: str) -> None:
    """Background phase: turn the selected items into a single EPUB.

    Default is zero-LLM: native subtitles grouped into paragraphs, never
    rewritten; videos without subtitles are skipped; blogs come from the article
    page (or the RSS preview if scraping fails). When the user selected LLM roles
    *and* an LLM is configured, the selected items are run through the cleanup
    engine instead (cached, with graceful fallback to the free path on failure).

    A visitor's own keys, when confirm received some, are taken here before
    anything can fail and win over the server's config for every call below.
    """
    held = credentials.take(job_id)
    llm = llm_endpoint(held.llm if held else None)
    stt = held.stt if held else None
    started = time.monotonic()
    # Filled as the compile goes, so a failure still reports how far it got.
    stats: dict = {"uses_visitor_llm": bool(held and held.llm), "uses_visitor_stt": stt is not None}
    try:
        items = get_selected_items(job_id)
        # Roles only act when there is a model to run them.
        roles = get_job_llm_roles(job_id) if llm is not None else []
        stats["source_types"] = dict(Counter(item.item_type for item in items))
        stats["ai_used"] = bool(roles)
        outcomes: Counter = Counter()
        chapters: list[CompiledChapter] = []

        for position, item in enumerate(items):
            if stop_requested(job_id):
                for left in items[position:]:
                    set_item_compile_state(job_id, left.id, "skipped", STOPPED)
                stats["stopped"] = True
                if not chapters:
                    stats["failure"] = "stopped"
                    raise CompilationError(STOPPED_EMPTY)
                break
            state, note, chapter = _build(job_id, item, roles, llm, stt)
            set_item_compile_state(job_id, item.id, state, note)
            outcomes[note if state == "failed" else state] += 1
            if chapter is not None:
                chapters.append(chapter)
        stats.update(
            chapter_count=len(chapters),
            skipped_count=outcomes["skipped"],
            failed_count=outcomes[YOUTUBE_RATE_LIMITED] + outcomes[ITEM_FAILED],
        )

        # Nothing built: say why, the most specific cause first. A wholly
        # rate-limited run is external and transient; a crash is not the
        # content's fault. Only an all-skipped run falls through to
        # compile_book's own "no usable content".
        if not chapters and outcomes[YOUTUBE_RATE_LIMITED]:
            stats["failure"] = "youtube_rate_limited"
            raise CompilationError(YOUTUBE_BUSY)
        if not chapters and outcomes[ITEM_FAILED]:
            stats["failure"] = "nothing_built"
            raise CompilationError(NOTHING_BUILT)

        job = get_job(job_id)
        book = compile_book(chapters, (job.book_title if job else None) or "Thothly compilation")
        if PREFACE in roles:
            book.preface = generate_preface(
                book.title, [c.title for c in book.chapters], llm, book.language
            )
        _render(book, job_id)
        update_job_status(job_id, "completed", book_title=book.title)
        logger.info("Compilation done for job %s: %d chapters", job_id, len(book.chapters))
        capture("compilation_completed", {**stats, "duration_s": round(time.monotonic() - started)}, job_id)

    except CompilationError as exc:
        # A hand-written, user-facing reason: surfaced as-is.
        logger.warning("No usable content for job %s: %s", job_id, exc)
        update_job_status(job_id, "failed", error=str(exc))
        stats.setdefault("failure", "no_content")
        capture("compilation_failed", {**stats, "duration_s": round(time.monotonic() - started)}, job_id)
    except Exception:
        # Anything else (a Pandoc render error, a network blip) keeps its raw
        # message in the log; the user gets one calm, written line instead.
        logger.exception("Compilation failed for job %s", job_id)
        update_job_status(
            job_id,
            "failed",
            error="The compilation failed to build. Try again.",
        )
        capture(
            "compilation_failed",
            {**stats, "failure": "crash", "duration_s": round(time.monotonic() - started)},
            job_id,
        )


def _build(
    job_id: str,
    item: DiscoveredItemResponse,
    roles: list[str],
    llm: Endpoint | None,
    stt: Endpoint | None,
) -> tuple[str, str | None, CompiledChapter | None]:
    """One item's (compile state, note, chapter). Never raises: one broken item
    must not cost the visitor the others."""

    def step(label: str) -> None:
        # The stage rides the item's note while it compiles: a long item (a big
        # transcript through several AI passes, an episode being transcribed)
        # would otherwise read as a hang.
        set_item_compile_state(job_id, item.id, "compiling", label)

    try:
        drafted = draft(item, transcribe=True, stt=stt, step=step)
        chapter = polish(
            item, drafted, roles, llm, should_stop=lambda: stop_requested(job_id), step=step
        )
    except CompileStopped:
        # Stopped mid-polish: the item is dropped, not half-polished.
        return "skipped", STOPPED, None
    except ItemSkipped as exc:
        logger.info("Skipped %s (job %s): %s", item.url, job_id, exc)
        return "skipped", str(exc), None
    except YouTubeUnavailable as exc:
        # Usually a 429 from this IP: failed rather than skipped, since retrying
        # later is the fix.
        logger.error("YouTube unavailable for %s (job %s): %s", item.url, job_id, exc)
        return "failed", YOUTUBE_RATE_LIMITED, None
    except Exception:
        logger.exception("Item %s failed (job %s)", item.url, job_id)
        return "failed", ITEM_FAILED, None
    return "done", None, chapter


def _render(book: CompiledBook, job_id: str) -> None:
    epub = output_file(job_id, "epub")
    render_epub(book, epub)
    # The same content as plain Markdown, without Pandoc or image localization,
    # so remote image URLs stay referenceable for an AI or a text tool.
    output_file(job_id, "md").write_text(book.to_markdown(), encoding="utf-8")
