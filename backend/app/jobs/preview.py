import logging

from app.jobs.models import DiscoveredItemResponse, ItemPreview
from app.jobs.runner import _extract_video_id
from app.pipeline.compiler import (
    demote_headings,
    html_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.sources.blog import ScrapeUnavailable, scrape_article
from app.sources.transcript_cache import load_transcript
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)

# Cap the previewed body so a multi-hour transcript doesn't ship megabytes to the
# browser — the opening is enough to judge the content. The real compile always
# uses the full text; `truncated` tells the UI to say so.
_PREVIEW_CHAR_LIMIT = 8000


def build_item_preview(item: DiscoveredItemResponse) -> ItemPreview:
    """Render the no-LLM content a discovered item would contribute.

    Deliberately reuses the compiler's *zero-LLM* rendering (see runner.py):
    same functions, same transforms, so what the review screen shows is exactly
    what lands in the EPUB when no AI cleanup role is selected — not an
    approximation. No LLM/STT is ever invoked here, so it's free and instant for
    YouTube (transcript already cached at discovery) and a single cheap scrape
    for blogs. Podcasts have no free preview (text needs metered transcription).
    """
    if item.item_type == "youtube":
        return _youtube_preview(item)
    if item.item_type == "blog":
        return _blog_preview(item)
    return _podcast_preview(item)


def _youtube_preview(item: DiscoveredItemResponse) -> ItemPreview:
    video_id = _extract_video_id(item.url)
    try:
        transcript = load_transcript(video_id)
    except YouTubeUnavailable as exc:
        logger.info("YouTube unavailable for preview of %s: %s", item.url, exc)
        return _unavailable(
            item,
            "YouTube is rate-limiting transcript requests right now — try the "
            "preview again shortly.",
        )

    if transcript is None:
        return _unavailable(
            item, "No subtitles for this video — it would be skipped at compile."
        )

    content_md = transcript_to_markdown(transcript)
    if not content_md.strip():
        return _unavailable(item, "The transcript came back empty.")

    # Raw auto-captions have no sentences, so the zero-LLM render is a rough wall
    # of text. The real compile auto-punctuates them when an LLM is configured —
    # flag that so the preview isn't mistaken for the final, cleaned result.
    note = None
    if item.is_punctuated is False:
        note = (
            "Raw auto-captions — this is the unprocessed text. Enabling AI "
            "cleanup will punctuate it into clean paragraphs."
        )
    return _available(item, content_md, note)


def _blog_preview(item: DiscoveredItemResponse) -> ItemPreview:
    note = None
    try:
        content_html = scrape_article(item.url).content_html
    except ScrapeUnavailable:
        logger.info("Scrape failed for preview of %s, using RSS preview", item.url)
        content_html = item.preview_html or ""
        note = "Couldn't fetch the full article — showing the RSS summary only."

    content_md = demote_headings(
        strip_leading_title(html_to_markdown(content_html), item.title)
    )
    if not content_md.strip():
        return _unavailable(
            item, "Couldn't extract readable content from this page."
        )
    return _available(item, content_md, note)


def _podcast_preview(item: DiscoveredItemResponse) -> ItemPreview:
    return _unavailable(
        item,
        "Podcasts are transcribed during compilation, so there's no preview "
        "before that step.",
    )


def _available(
    item: DiscoveredItemResponse, content_md: str, note: str | None
) -> ItemPreview:
    truncated = len(content_md) > _PREVIEW_CHAR_LIMIT
    if truncated:
        content_md = content_md[:_PREVIEW_CHAR_LIMIT].rstrip() + "…"
    return ItemPreview(
        item_id=item.id,
        item_type=item.item_type,
        available=True,
        content_md=content_md,
        truncated=truncated,
        note=note,
    )


def _unavailable(item: DiscoveredItemResponse, note: str) -> ItemPreview:
    return ItemPreview(
        item_id=item.id, item_type=item.item_type, available=False, note=note
    )
