import logging

from app.jobs.chapters import NO_CONTENT, NO_SUBTITLES, NO_TRANSCRIPTION, ItemSkipped, draft
from app.jobs.models import DiscoveredItemResponse, ItemPreview
from app.sources.youtube import YouTubeUnavailable

logger = logging.getLogger(__name__)

# The opening is enough to judge the content; a multi-hour transcript would
# ship megabytes to the browser. The compile always uses the full text.
_PREVIEW_CHAR_LIMIT = 8000

_WHY_NOTHING = {
    NO_SUBTITLES: "This video has no subtitles, so it would be skipped when compiling.",
    NO_TRANSCRIPTION: (
        "This episode has no published transcript, so its text is made from "
        "the audio when compiling."
    ),
    NO_CONTENT: "There's no readable content here, so it would be skipped when compiling.",
}


def build_item_preview(item: DiscoveredItemResponse) -> ItemPreview:
    """The chapter a discovered item would contribute with no AI, as the compile
    builds it. Free: nothing is ever transcribed for a preview."""
    try:
        drafted = draft(item, transcribe=False)
    except ItemSkipped as exc:
        return _unavailable(item, _WHY_NOTHING[str(exc)])
    except YouTubeUnavailable as exc:
        logger.info("YouTube unavailable for preview of %s: %s", item.url, exc)
        return _unavailable(
            item,
            "YouTube is rate-limiting transcript requests right now. Try the "
            "preview again shortly.",
        )
    content = drafted.chapter.content_md
    truncated = len(content) > _PREVIEW_CHAR_LIMIT
    if truncated:
        content = content[:_PREVIEW_CHAR_LIMIT].rstrip() + "…"
    return ItemPreview(
        item_id=item.id,
        item_type=item.item_type,
        available=True,
        content_md=content,
        truncated=truncated,
        note=drafted.note,
    )


def _unavailable(item: DiscoveredItemResponse, note: str) -> ItemPreview:
    return ItemPreview(item_id=item.id, item_type=item.item_type, available=False, note=note)
