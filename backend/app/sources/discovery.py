import logging
import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from app.core.config import settings
from app.pipeline.compiler import is_punctuated
from app.sources.blog import FeedUnavailable, list_feed
from app.sources.blog import _fetch_url  # internal HTTP fetch with hard timeout
from app.sources.models import Article
from app.sources.transcript_cache import load_transcript
from app.sources.youtube import (
    YouTubeUnavailable,
    fetch_video_meta,
    list_videos,
)

logger = logging.getLogger(__name__)

_RSS_PATHS = ["/feed", "/rss", "/feed.xml", "/index.xml", "/rss.xml"]
_CHANNEL_TABS = ("/videos", "/streams", "/shorts", "/featured")
_WORDS_PER_MINUTE = 200  # average silent reading speed, for time estimates

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
    # Filled in for YouTube items by _enrich_youtube_item (see below).
    has_transcript: bool | None = None
    transcript_lang: str | None = None
    is_punctuated: bool | None = None
    word_count: int | None = None
    reading_time_min: int | None = None


def detect_kind(url: str) -> str:
    """Classify a pasted URL so the user never has to pick a source type.

    Returns one of: youtube_playlist, youtube_video, youtube_channel, blog.
    """
    u = url.lower()
    # An explicit video id wins over a playlist context: a link to a specific
    # video (even one carrying `?list=…`) means "this video", not the whole list.
    if ("youtube.com/watch" in u and "v=" in u) or "youtu.be/" in u:
        return "youtube_video"
    if "list=" in u or "youtube.com/playlist" in u:
        return "youtube_playlist"
    if re.search(r"youtube\.com/(@|channel/|c/|user/)", u):
        return "youtube_channel"
    return "blog"


def discover_source(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    """Return the (source name, items) for a pasted URL.

    The source name (playlist/channel/feed/site title) feeds a meaningful
    default book title; it's captured from the same calls that list the items,
    so it costs no extra request.
    """
    kind = detect_kind(url)
    logger.info("Discovering source %d (kind=%s, url=%s)", source_index, kind, url)

    if kind == "youtube_playlist":
        return _discover_youtube(url, source_index)
    if kind == "youtube_channel":
        return _discover_youtube(_channel_videos_url(url), source_index)
    if kind == "youtube_video":
        return _discover_youtube_video(url, source_index)
    return _discover_blog(url, source_index)


def _discover_youtube(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    title, videos = list_videos(url)
    videos = videos[: settings.max_items_per_source]
    items = [
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
    for item in items:
        _enrich_youtube_item(item)
    return title, items


def _discover_youtube_video(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    video = fetch_video_meta(_clean_video_url(url))
    item = DiscoveredItem(
        title=video.title or f"Vidéo YouTube {video.id}",
        url=video.url,
        item_type="youtube",
        source_index=source_index,
        item_index=0,
        estimated_duration_s=video.duration_s,
    )
    _enrich_youtube_item(item)
    return video.title or None, [item]


def _enrich_youtube_item(item: DiscoveredItem) -> None:
    """Fetch the transcript once, here, to drive the review screen.

    This is the deliberate cost the user accepted: discovery is no longer free
    for YouTube, but in exchange the review screen can show, per video, whether
    it has usable subtitles, in which language, how long it is to read, and
    whether the text is punctuated (clean) or will need an LLM cleanup pass. The
    transcript is cached on the item so compilation reuses it instead of hitting
    YouTube a second time. Best-effort: any failure leaves the item flagged and
    never breaks discovery.
    """
    video_id = _video_id(item.url)
    try:
        transcript = load_transcript(video_id)
    except YouTubeUnavailable as exc:
        logger.warning("Transcript probe failed for %s: %s", video_id, exc)
        item.has_transcript = None  # unknown — couldn't reach YouTube
        return

    if transcript is None:
        item.has_transcript = False  # no native subtitles → will be skipped
        return

    full_text = " ".join(
        s.text.strip() for s in transcript.segments if s.text and s.text.strip()
    )
    word_count = len(full_text.split())

    # The transcript itself is now in the video-keyed cache (load_transcript
    # stored it); we only keep the derived review metadata on the item.
    item.has_transcript = True
    item.transcript_lang = transcript.language
    item.is_punctuated = is_punctuated(full_text)
    item.word_count = word_count
    item.reading_time_min = max(1, round(word_count / _WORDS_PER_MINUTE))


def _video_id(url: str) -> str:
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else url.rstrip("/").split("/")[-1]


def _clean_video_url(url: str) -> str:
    """Strip playlist/extra params: a single-video URL must extract one video."""
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{6,})", url)
    if match:
        return f"https://www.youtube.com/watch?v={match.group(1)}"
    return url


def _channel_videos_url(url: str) -> str:
    base = url.split("?")[0].rstrip("/")
    for tab in _CHANNEL_TABS:
        if base.endswith(tab):
            base = base[: -len(tab)]
            break
    return f"{base.rstrip('/')}/videos"


def _discover_blog(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    # 0) a specific article URL → just that article. Otherwise we'd treat the
    # page as a homepage and crawl its links (next/previous, related, nav…),
    # flooding the review list with junk the user never asked for.
    if _looks_like_article(url, url):
        return _single_article(url, source_index)

    # 1) the URL might already be a feed — try it directly.
    feed_items = _feed_to_items(url, source_index)
    if feed_items is not None:
        return feed_items

    # 2) try common feed paths on the same host.
    autodetected = _try_autodetect_rss(url, source_index)
    if autodetected is not None:
        return autodetected

    # 3) otherwise treat it as a homepage and extract article links.
    html = _fetch_url(url, settings.scrape_timeout_s)
    if not html:
        raise RuntimeError(f"Could not fetch homepage: {url}")

    links = _extract_article_links(html, url)
    items = [
        DiscoveredItem(
            title=title,
            url=link,
            item_type="blog",
            source_index=source_index,
            item_index=i,
        )
        for i, (link, title) in enumerate(links[: settings.max_items_per_source])
    ]
    return _html_title(html), items


def _feed_to_items(
    feed_url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]] | None:
    try:
        feed_title, articles = list_feed(feed_url)
    except FeedUnavailable:
        return None
    if not articles:
        return None
    articles = articles[: settings.max_items_per_source]
    items = [_article_to_item(a, source_index, i) for i, a in enumerate(articles)]
    return feed_title, items


def _try_autodetect_rss(
    homepage_url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]] | None:
    parsed = urlparse(homepage_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    for path in _RSS_PATHS:
        result = _feed_to_items(f"{base}{path}", source_index)
        if result is not None:
            logger.info("Auto-detected feed %s%s", base, path)
            return result
    return None


def _single_article(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    """One discovered item for a directly-pasted article URL (no crawling)."""
    html = _fetch_url(url, settings.scrape_timeout_s)
    title = (_html_title(html) if html else None) or _slug_from_url(url)
    item = DiscoveredItem(
        title=title,
        url=url,
        item_type="blog",
        source_index=source_index,
        item_index=0,
    )
    return title, [item]


def _html_title(html: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    if soup.title and soup.title.string:
        return soup.title.string.strip() or None
    return None


def _extract_article_links(html: str, base_url: str) -> list[tuple[str, str]]:
    """Return a deduplicated list of (url, title) for likely article links."""
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    links: list[tuple[str, str]] = []

    for tag in soup.find_all("a", href=True):
        href = urljoin(base_url, tag["href"]).split("#")[0]
        if href in seen or not _looks_like_article(href, base_url):
            continue
        seen.add(href)
        text = re.sub(r"\s+", " ", tag.get_text(separator=" ", strip=True)).strip()
        text = _collapse_repeated_text(text)
        title = text if len(text) >= 4 else _slug_from_url(href)
        links.append((href, title))

    return links


def _collapse_repeated_text(text: str) -> str:
    """Card links sometimes duplicate their text (responsive variants kept in
    the DOM), yielding 'Title Title Title'. If the words are an exact k-fold
    repetition, keep a single copy."""
    words = text.split()
    n = len(words)
    for k in (4, 3, 2):
        if n % k == 0 and words[: n // k] * k == words:
            return " ".join(words[: n // k])
    return text


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
