from datetime import datetime
from time import struct_time

import feedparser

from app.sources.models import Article


class FeedUnavailable(Exception):
    pass


def list_feed(feed_url: str) -> list[Article]:
    result = feedparser.parse(feed_url)
    status = getattr(result, "status", 200)
    if status >= 400:
        raise FeedUnavailable(f"HTTP {status} fetching {feed_url}")
    return [_entry_to_article(entry) for entry in result.entries]


def _entry_to_article(entry) -> Article:
    content_items = getattr(entry, "content", [])
    if content_items:
        content_html = content_items[0].value
    elif getattr(entry, "summary", None):
        content_html = entry.summary
    else:
        content_html = ""

    return Article(
        url=getattr(entry, "link", ""),
        title=getattr(entry, "title", ""),
        published_at=_parse_struct_time(getattr(entry, "published_parsed", None)),
        author=getattr(entry, "author", None) or None,
        content_html=content_html,
    )


def _parse_struct_time(t: struct_time | None) -> datetime | None:
    if t is None:
        return None
    try:
        return datetime(*t[:6])
    except (TypeError, ValueError):
        return None
