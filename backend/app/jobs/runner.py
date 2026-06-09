import logging
import re
from pathlib import Path

from app.core.config import settings
from app.jobs.models import DiscoveredItemResponse
from app.jobs.repository import (
    get_job,
    get_job_llm_roles,
    get_selected_items,
    update_job_status,
)
from app.pipeline.cleanup import clean_markdown, clean_transcript, generate_preface
from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    demote_headings,
    html_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.pipeline.llm import llm_available
from app.pipeline.models import CompiledChapter
from app.pipeline.roles import PREFACE, has_role
from app.render.epub import render_epub
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.transcript_cache import load_transcript
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)


def run_compilation(job_id: str) -> None:
    """Background phase: turn the selected items into a single EPUB.

    Default is zero-LLM: native subtitles grouped into paragraphs, never
    rewritten; videos without subtitles are skipped; blogs come from the article
    page (or the RSS preview if scraping fails). When the user selected LLM roles
    *and* an LLM is configured, the selected items are run through the cleanup
    engine instead (cached, with graceful fallback to the free path on failure).
    """
    try:
        items = get_selected_items(job_id)
        # Active only when roles were chosen AND an LLM endpoint is configured.
        roles = get_job_llm_roles(job_id) if llm_available() else []
        model = settings.llm_model or ""
        chapters: list[CompiledChapter] = []
        youtube_unavailable = False

        for item in items:
            try:
                if item.item_type == "youtube":
                    chapter = _youtube_chapter(item, job_id, roles, model)
                else:
                    chapter = _blog_chapter(item, job_id, roles, model)
            except YouTubeUnavailable as exc:
                logger.error("YouTube unavailable for %s (job %s): %s", item.url, job_id, exc)
                youtube_unavailable = True
                continue
            if chapter is not None:
                chapters.append(chapter)

        if not chapters and youtube_unavailable:
            raise CompilationError(
                "YouTube is rate-limiting transcript requests (HTTP 429) from this "
                "IP. This usually clears after a while — try again later. For a "
                "self-hosted server, a residential proxy avoids it."
            )

        job = get_job(job_id)
        book_title = (job.book_title if job else None) or "Compilation Thothly"
        book = compile_book(chapters, book_title)
        if has_role(roles, PREFACE):
            book.preface = generate_preface(book.title, [c.title for c in book.chapters])
        output_path = _render(book, job_id)
        update_job_status(
            job_id, "completed", book_title=book.title, output_path=output_path
        )
        logger.info("Compilation done for job %s: %d chapters", job_id, len(book.chapters))

    except CompilationError as exc:
        logger.warning("No usable content for job %s: %s", job_id, exc)
        update_job_status(job_id, "failed", error=str(exc))
    except Exception as exc:
        logger.exception("Compilation failed for job %s", job_id)
        update_job_status(job_id, "failed", error=str(exc))


def _youtube_chapter(
    item: DiscoveredItemResponse, job_id: str, roles: list[str], model: str
) -> CompiledChapter | None:
    video_id = _extract_video_id(item.url)
    # Cache hit from discovery (full segments + chapters); falls back to a live
    # fetch only if the cache was never populated. A YouTubeUnavailable here
    # (e.g. a 429) propagates so run_compilation can report it clearly.
    transcript = load_transcript(video_id)
    if transcript is None:
        logger.info("No native subtitles for %s, skipping (job %s)", video_id, job_id)
        return None

    if roles:
        content_md = clean_transcript(transcript, roles, model)
    else:
        content_md = transcript_to_markdown(transcript)
    if not content_md:
        return None

    return CompiledChapter(
        title=item.title,
        source_type="youtube",
        source_url=item.url,
        author=transcript.uploader,
        channel_url=transcript.channel_url,
        content_md=content_md,
    )


def _blog_chapter(
    item: DiscoveredItemResponse, job_id: str, roles: list[str], model: str
) -> CompiledChapter | None:
    author = None
    published_at = None
    try:
        article = scrape_article(item.url)
        content_html = article.content_html
        author = article.author
        published_at = article.published_at
    except ScrapeUnavailable:
        logger.warning("Scrape failed for %s (job %s), using RSS preview", item.url, job_id)
        content_html = item.preview_html or ""

    content_md = html_to_markdown(content_html)
    content_md = demote_headings(strip_leading_title(content_md, item.title))
    if not content_md:
        return None

    if roles:
        content_md = clean_markdown(content_md, roles, model, content_key=item.url)

    return CompiledChapter(
        title=item.title,
        source_type="blog",
        source_url=item.url,
        author=author,
        published_at=published_at,
        content_md=content_md,
    )


def _extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else url.rstrip("/").split("/")[-1]


def _render(book, job_id: str) -> str:
    output_dir = settings.data_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{job_id}.epub"
    render_epub(book, output_path)
    return str(output_path)
