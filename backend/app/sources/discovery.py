import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.core.config import settings
from app.sources.blog import FeedUnavailable, list_feed
from app.sources.blog import _fetch_url  # internal HTTP fetch with hard timeout
from app.sources.models import Article
from app.sources.youtube import list_videos

logger = logging.getLogger(__name__)

_RSS_PATHS = ["/feed", "/rss", "/feed.xml", "/index.xml", "/rss.xml"]

_EXCLUDE_PATTERNS = [
    "/about", "/contact", "/newsletter", "/privacy", "/terms",
    "/rss", "/feed", "/tag/", "/category/", "/author/", "/page/", "/search",
]

_FILE_EXTENSIONS = (
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".svg",
    ".zip", ".tar", ".gz", ".mp3", ".mp4", ".wav",
)


@dataclass
class DiscoveredItem:
    title: str
    url: str
    item_type: str  # "youtube" | "blog"
    source_index: int
    item_index: int
    estimated_duration_s: int | None = None
    estimated_size_chars: int | None = None
    preview_html: str | None = None


def discover_source(source_type: str, url: str, source_index: int) -> list[DiscoveredItem]:
    logger.info("Discovering source %d (type=%s, url=%s)", source_index, source_type, url)

    if source_type in ("youtube_channel", "youtube_playlist"):
        return _discover_youtube(url, source_index)
    if source_type == "blog_rss":
        return _discover_rss(url, source_index)
    if source_type == "blog_url":
        return _discover_blog(url, source_index)

    logger.warning("Unknown source type: %s", source_type)
    return []


def _discover_youtube(url: str, source_index: int) -> list[DiscoveredItem]:
    videos = list_videos(url)[: settings.max_items_per_source]
    return [
        DiscoveredItem(
            title=video.title,
            url=video.url,
            item_type="youtube",
            source_index=source_index,
            item_index=i,
            estimated_duration_s=video.duration_s,
        )
        for i, video in enumerate(videos)
    ]


def _discover_rss(url: str, source_index: int) -> list[DiscoveredItem]:
    articles = list_feed(url)[: settings.max_items_per_source]
    return [_article_to_item(a, source_index, i) for i, a in enumerate(articles)]


def _discover_blog(homepage_url: str, source_index: int) -> list[DiscoveredItem]:
    feed_items = _try_autodetect_rss(homepage_url, source_index)
    if feed_items:
        return feed_items

    html = _fetch_url(homepage_url, settings.scrape_timeout_s)
    if not html:
        raise RuntimeError(f"Could not fetch homepage: {homepage_url}")

    links = _extract_article_links(html, homepage_url)
    return [
        DiscoveredItem(
            title=title,
            url=url,
            item_type="blog",
            source_index=source_index,
            item_index=i,
        )
        for i, (url, title) in enumerate(links[: settings.max_items_per_source])
    ]


def _try_autodetect_rss(homepage_url: str, source_index: int) -> list[DiscoveredItem] | None:
    parsed = urlparse(homepage_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    for path in _RSS_PATHS:
        try:
            articles = list_feed(f"{base}{path}")
        except FeedUnavailable:
            continue
        if articles:
            articles = articles[: settings.max_items_per_source]
            logger.info("Auto-detected feed %s%s", base, path)
            return [_article_to_item(a, source_index, i) for i, a in enumerate(articles)]
    return None


def _extract_article_links(html: str, base_url: str) -> list[tuple[str, str]]:
    """Return a deduplicated list of (url, title) for likely article links."""
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    links: list[tuple[str, str]] = []

    for tag in soup.find_all("a", href=True):
        href = urljoin(base_url, tag["href"]).split("#")[0]
        if href in seen:
            continue
        if not _looks_like_article(href, base_url):
            continue
        seen.add(href)
        text = tag.get_text(strip=True)
        title = text if len(text) >= 4 else _slug_from_url(href)
        links.append((href, title))

    return links


def _looks_like_article(href: str, base_url: str) -> bool:
    parsed = urlparse(href)
    base = urlparse(base_url)

    if parsed.netloc and parsed.netloc != base.netloc:
        return False
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in _FILE_EXTENSIONS):
        return False
    if any(pattern in path for pattern in _EXCLUDE_PATTERNS):
        return False
    if re.match(r"/\d{4}/", path):
        return True
    if any(seg in path for seg in ("/post/", "/posts/", "/article/", "/articles/")):
        return True
    if "/blog/" in path and path.count("/") >= 3:
        return True
    slug = path.rstrip("/").split("/")[-1]
    return len(slug) >= 8 and "-" in slug


def _article_to_item(article: Article, source_index: int, item_index: int) -> DiscoveredItem:
    preview = article.content_html[:500] if article.content_html else None
    return DiscoveredItem(
        title=article.title or "Untitled",
        url=str(article.url),
        item_type="blog",
        source_index=source_index,
        item_index=item_index,
        estimated_size_chars=len(article.content_html) if article.content_html else None,
        preview_html=preview,
    )


def _slug_from_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        return url
    return path.split("/")[-1].replace("-", " ").replace("_", " ").title()
