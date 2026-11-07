"""The cover's emblem: when every chapter comes from one origin, that origin's
own mark (a site's icon, a YouTube channel's avatar); otherwise none, and the
cover keeps the bundled Thothly emblem."""

import logging
from urllib.parse import urlparse

from app.pipeline.models import CompiledBook
from app.render.images import favicon_candidates
from app.sources.youtube import fetch_channel_avatar_url

logger = logging.getLogger(__name__)


def emblem_urls(book: CompiledBook) -> list[str]:
    """Episodes carry no mark of their own and don't count either way."""
    pages = [c.source_url for c in book.chapters if c.source_type == "blog"]
    videos = [c for c in book.chapters if c.source_type == "youtube"]
    channels = {c.channel_url for c in videos if c.channel_url}
    try:
        if pages and not videos and len({urlparse(u).netloc for u in pages}) == 1:
            return favicon_candidates(pages[0])
        if videos and not pages and len(channels) == 1:
            avatar = fetch_channel_avatar_url(channels.pop())
            return [avatar] if avatar else []
    except Exception as exc:  # noqa: BLE001 - an emblem is never worth a failed book
        logger.info("Source emblem lookup failed; using the default: %s", exc)
    return []
