import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime
from time import struct_time

import feedparser
import trafilatura

from app.core.config import settings
from app.sources.models import Article

logger = logging.getLogger(__name__)


class FeedUnavailable(Exception):
    pass


class ScrapeUnavailable(Exception):
    pass


def list_feed(feed_url: str) -> tuple[str | None, list[Article]]:
    """Return the (feed title, articles) for an RSS/Atom feed."""
    result = feedparser.parse(feed_url)
    status = getattr(result, "status", 200)
    if status is not None and status >= 400:
        raise FeedUnavailable(f"HTTP {status} fetching {feed_url}")
    feed = getattr(result, "feed", None)
    title = (feed.get("title") if feed else None) or None
    return title, [_entry_to_article(entry) for entry in result.entries]


def scrape_article(url: str) -> Article:
    """Extract a single article's content from its page via trafilatura.

    Used for blogs without an RSS feed, or to recover the full text of an
    article whose feed only provided a truncated summary.
    """
    downloaded = _fetch_url(url, settings.scrape_timeout_s)
    if not downloaded:
        raise ScrapeUnavailable(f"Failed to download page: {url}")

    # include_formatting/include_links keep bold, italics and hyperlinks (both
    # default to False, which would flatten the article to plain text). Tables
    # are kept by trafilatura's include_tables default. include_images keeps the
    # article's figures; the EPUB renderer downloads and embeds them, dropping
    # any that can't be fetched. This preserves the author's structure and
    # emphasis in the EPUB without any LLM involvement.
    content_html = trafilatura.extract(
        downloaded,
        output_format="html",
        url=url,
        include_formatting=True,
        include_links=True,
        include_images=True,
    )
    if not content_html:
        raise ScrapeUnavailable(f"Could not extract content from: {url}")

    title, author, published_at = _extract_metadata(downloaded, url)
    return Article(
        url=url,
        title=title,
        published_at=published_at,
        author=author,
        content_html=content_html,
    )


def _fetch_url(url: str, timeout: float) -> str | None:
    """Run trafilatura.fetch_url under a hard timeout.

    trafilatura's fetch_url has no timeout parameter, so we bound it with a
    worker thread to avoid hanging the discovery/compilation phase.
    """
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(trafilatura.fetch_url, url)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError:
            logger.warning("Timed out downloading %s after %ss", url, timeout)
            return None


def _extract_metadata(
    downloaded: str, url: str
) -> tuple[str, str | None, datetime | None]:
    raw = trafilatura.extract(
        downloaded, output_format="json", with_metadata=True, url=url
    )
    if not raw:
        return "", None, None

    try:
        meta = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Failed to parse trafilatura metadata for %s", url)
        return "", None, None

    return (
        meta.get("title") or "",
        meta.get("author") or None,
        _parse_date(meta.get("date")),
    )


def _parse_date(date_str: str | None) -> datetime | None:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


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
