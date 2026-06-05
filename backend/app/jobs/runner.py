import logging
import re
from pathlib import Path

from app.core.config import settings
from app.jobs.models import DiscoveredItemResponse
from app.jobs.repository import get_selected_items, update_job_status
from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    derive_book_title,
    html_to_markdown,
    segments_to_markdown,
)
from app.pipeline.models import CompiledChapter
from app.render.epub import render_epub
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.youtube import YouTubeUnavailable, fetch_transcript

logger = logging.getLogger(__name__)


def run_compilation(job_id: str) -> None:
    """Background phase: turn the selected items into a single EPUB.

    Zero-LLM policy: YouTube content is the native subtitles, grouped into
    paragraphs but never rewritten. Videos without subtitles are skipped (no
    Voxtral fallback). Blog content comes from the article page (or the RSS
    preview if scraping fails).
    """
    try:
        items = get_selected_items(job_id)
        chapters: list[CompiledChapter] = []

        for item in items:
            if item.item_type == "youtube":
                chapter = _youtube_chapter(item, job_id)
            else:
                chapter = _blog_chapter(item, job_id)
            if chapter is not None:
                chapters.append(chapter)

        book = compile_book(chapters, derive_book_title(_source_labels(items)))
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


def _youtube_chapter(item: DiscoveredItemResponse, job_id: str) -> CompiledChapter | None:
    video_id = _extract_video_id(item.url)
    try:
        transcript = fetch_transcript(video_id)
    except YouTubeUnavailable as exc:
        logger.error("YouTube unavailable for %s (job %s): %s", video_id, job_id, exc)
        return None

    if transcript is None:
        logger.info("No native subtitles for %s, skipping (job %s)", video_id, job_id)
        return None

    content_md = segments_to_markdown([s.text for s in transcript.segments])
    if not content_md:
        return None

    return CompiledChapter(
        title=item.title,
        source_type="youtube",
        source_url=item.url,
        content_md=content_md,
    )


def _blog_chapter(item: DiscoveredItemResponse, job_id: str) -> CompiledChapter | None:
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
    if not content_md:
        return None

    return CompiledChapter(
        title=item.title,
        source_type="blog",
        source_url=item.url,
        author=author,
        published_at=published_at,
        content_md=content_md,
    )


def _source_labels(items: list[DiscoveredItemResponse]) -> list[str]:
    youtube_count = sum(1 for it in items if it.item_type == "youtube")
    blog_count = sum(1 for it in items if it.item_type == "blog")

    labels: list[str] = []
    if youtube_count:
        labels.append(f"{youtube_count} YouTube video{'s' if youtube_count > 1 else ''}")
    if blog_count:
        labels.append(f"{blog_count} article{'s' if blog_count > 1 else ''}")
    return labels


def _extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else url.rstrip("/").split("/")[-1]


def _render(book, job_id: str) -> str:
    output_dir = settings.data_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{job_id}.epub"
    render_epub(book, output_path)
    return str(output_path)
