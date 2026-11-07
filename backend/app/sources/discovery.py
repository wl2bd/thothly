import logging
import re
from pathlib import PurePosixPath
from urllib.parse import unquote, urljoin, urlparse

from bs4 import BeautifulSoup

from app.core.config import settings
from app.search.web import is_locale_segment
from app.sources.blog import FeedUnavailable, fetch_page, list_feed
from app.sources.models import Article, DiscoveredItem, SourceSpec, Transcript
from app.sources.wikipedia import article_title, is_wikipedia_article
from app.sources import podcast
from app.sources.youtube import (
    VIDEO_ID_RE,
    YouTubeUnavailable,
    fetch_video_meta,
    list_videos,
    load_transcript,
    video_id,
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


_AUDIO_EXTENSIONS = (".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav")


def detect_kind(url: str) -> str:
    """Classify a pasted URL so the user never has to pick a source type.

    Returns one of: youtube_playlist, youtube_video, youtube_channel, podcast,
    blog.
    """
    u = url.lower()
    # An explicit video id wins over a playlist context: a link to a specific
    # video (even one carrying `?list=…`) means "this video", not the whole list.
    if ("youtube.com/watch" in u and "v=" in u) or VIDEO_ID_RE.search(url):
        return "youtube_video"
    if "list=" in u or "youtube.com/playlist" in u:
        return "youtube_playlist"
    if re.search(r"youtube\.com/(@|channel/|c/|user/)", u):
        return "youtube_channel"
    # A bare audio enclosure (pasted, or wrapped only by query/fragment) is an
    # episode. Picked podcast results skip this by passing kind="podcast".
    if urlparse(u).path.endswith(_AUDIO_EXTENSIONS):
        return "podcast"
    return "blog"


def discover_source(
    source: SourceSpec, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    """Return the (source name, items) for a source.

    The source name (playlist/channel/feed/site title) feeds a meaningful
    default book title; it's captured from the same calls that list the items,
    so it costs no extra request.
    """
    url = str(source.url)
    kind = source.kind or detect_kind(url)
    logger.info("Discovering source %d (kind=%s, url=%s)", source_index, kind, url)

    if kind == "podcast":
        return _discover_podcast(source, source_index)
    if kind == "youtube_playlist":
        return _discover_youtube(url, source_index)
    if kind == "youtube_channel":
        return _discover_youtube(_channel_videos_url(url), source_index)
    if kind == "youtube_video":
        return _discover_youtube_video(url, source_index)
    # A web page picked from search stays that page instead of unfolding into
    # its site's whole feed (one job ad once came back as 250). A home or
    # section still unfolds.
    if source.query and _is_deep_page(url):
        return _single_article(url, source_index)
    return _discover_blog(url, source_index)


def _is_deep_page(url: str) -> bool:
    """Two or more path segments once a locale prefix is set aside: a page, not
    a home (`/`, `/fr/`) or a section (`/blog`)."""
    segments = [s for s in urlparse(url).path.split("/") if s]
    if segments and is_locale_segment(segments[0]):
        segments = segments[1:]
    return len(segments) >= 2



def _discover_podcast(
    source: SourceSpec, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    """One item for a podcast episode. The audio isn't probed here: its length
    comes from the search result, the only place it's known.

    Its published transcript is looked up now, like a video's subtitles, so
    review shows its text instead of promising it for later: the show's own
    feed first (free), then Exa, one flat lookup (~$0.007) the compile would pay
    anyway, and the hit is cached. Only picked episodes come through here; a
    feed's episodes aren't probed, a long feed would cost one lookup each.
    Never transcribes, and any failure leaves the item as "From audio"."""
    url = str(source.url)
    title = source.title or _episode_title_from_url(url)
    item = DiscoveredItem(
        title=title,
        url=url,
        item_type="podcast",
        source_index=source_index,
        item_index=0,
        estimated_duration_s=source.duration_s,
        feed_url=source.feed_url,
    )
    try:
        transcript = podcast.find_published_transcript(item)
    except Exception as exc:  # noqa: BLE001 - best effort, never breaks discovery
        logger.warning("Published transcript lookup failed for %s: %s", url, exc)
        transcript = None
    if transcript is not None:
        _apply_transcript_stats(item, transcript)
    return title, [item]


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
    # Only the first N items get a live transcript probe — each is a sequential
    # yt-dlp fetch, so probing a whole large playlist would trip YouTube's rate
    # limit (429). The rest are listed with unknown transcript info; the compile
    # fetches the transcript for any of them the user actually selects.
    for item in items[: settings.youtube_discovery_probe_limit]:
        _enrich_youtube_item(item)
    return title, items


def _discover_youtube_video(
    url: str, source_index: int
) -> tuple[str | None, list[DiscoveredItem]]:
    video = fetch_video_meta(url)
    item = DiscoveredItem(
        title=video.title or f"YouTube video {video.id}",
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
    vid = video_id(item.url)
    try:
        transcript = load_transcript(vid)
    except YouTubeUnavailable as exc:
        logger.warning("Transcript probe failed for %s: %s", vid, exc)
        item.has_transcript = None  # unknown — couldn't reach YouTube
        return

    if transcript is None:
        item.has_transcript = False  # no native subtitles → will be skipped
        return

    # The transcript itself is now in the video-keyed cache (load_transcript
    # stored it); we only keep the derived review metadata on the item.
    _apply_transcript_stats(item, transcript)


def _apply_transcript_stats(item: DiscoveredItem, transcript: Transcript) -> None:
    word_count = len(transcript.full_text.split())
    item.has_transcript = True
    item.transcript_lang = transcript.language
    item.is_punctuated = transcript.is_punctuated
    item.word_count = word_count
    item.reading_time_min = max(1, round(word_count / _WORDS_PER_MINUTE))


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
    # A Wikipedia page is one article whatever its URL looks like ("/wiki/Stoicism"
    # has no date or slug to go on); crawled, it gave 63 items of links and ISBNs.
    if is_wikipedia_article(url):
        title = article_title(url)
        return title, [DiscoveredItem(title=title, url=url, item_type="blog",
                                      source_index=source_index, item_index=0)]
    if _looks_like_article(url, url):
        return _single_article(url, source_index)

    # 1) the URL might already be a feed — try it directly.
    feed_items = _feed_to_items(url, source_index)
    if feed_items is not None:
        return feed_items

    # 2) the feed the page itself declares (<link rel="alternate">), the standard
    # way. It beats guessing: a page at /fr/ can declare /fr/index.xml, while
    # the guessed /index.xml at the host root is the English blog.
    html = fetch_page(url, settings.scrape_timeout_s)
    for feed_url in _declared_feeds(html, url) if html else []:
        declared = _feed_to_items(feed_url, source_index)
        if declared is not None:
            return declared

    # 3) try common feed paths on the same host.
    autodetected = _try_autodetect_rss(url, source_index)
    if autodetected is not None:
        return autodetected

    # 4) otherwise treat it as a homepage and extract article links.
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
            uncertain=uncertain,
        )
        for i, (link, title, uncertain) in enumerate(
            links[: settings.max_items_per_source]
        )
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
    items = [_article_to_item(a, source_index, i, feed_url) for i, a in enumerate(articles)]
    return feed_title, items


def _declared_feeds(html: str, page_url: str) -> list[str]:
    """Feed URLs a page advertises in its <head>, absolute, in page order."""
    soup = BeautifulSoup(html, "html.parser")
    return [
        urljoin(page_url, link["href"])
        for link in soup.select('link[rel~="alternate"][href]')
        if any(t in (link.get("type") or "") for t in ("rss", "atom"))
        # Comment feeds are feeds too, but of the wrong thing.
        and "comment" not in link["href"].lower()
    ]


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
    html = fetch_page(url, settings.scrape_timeout_s)
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


# Page furniture: menus, sidebars, footers, reference lists. A homepage's
# article list never lives in them, and they're where most junk links come from.
_FURNITURE = (
    "nav, header, footer, aside, [role=navigation], [role=banner], "
    "[role=contentinfo], [role=complementary], .navbox, .reflist, "
    "ol.references, .references, .mw-references-wrap"
)
# Running prose. A link here is a mention inside a sentence, which on a homepage
# is sometimes a post but often just a cross-reference.
_PROSE = ("p", "blockquote", "dd", "figcaption")


def _extract_article_links(
    html: str, base_url: str
) -> list[tuple[str, str, bool]]:
    """Deduplicated (url, title, uncertain) for likely article links, the
    confident ones first so the item cap never cuts them for a mention."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.select(_FURNITURE):
        tag.decompose()
    page = base_url.split("#")[0].rstrip("/")
    seen: set[str] = set()
    sure: list[tuple[str, str, bool]] = []
    unsure: list[tuple[str, str, bool]] = []

    for tag in soup.find_all("a", href=True):
        href = urljoin(base_url, tag["href"]).split("#")[0]
        if href in seen or href.rstrip("/") == page:
            continue
        if not _looks_like_article(href, base_url):
            continue
        text = re.sub(r"\s+", " ", tag.get_text(separator=" ", strip=True)).strip()
        text = _collapse_repeated_text(text)
        # ISBNs, page numbers, years: a citation, not an article.
        if text and not re.search(r"[^\W\d_]", text):
            continue
        seen.add(href)
        title = text if len(text) >= 4 else _slug_from_url(href)
        in_prose = tag.find_parent(_PROSE) is not None
        (unsure if in_prose else sure).append((href, title, in_prose))

    return sure + unsure


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
    # Wiki namespaces (Special:, Category:, File:…) are tools, never articles.
    if ":" in unquote(path):
        return False
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


def _article_to_item(
    article: Article, source_index: int, item_index: int, feed_url: str
) -> DiscoveredItem:
    # A podcast feed's episode: the audio is the content, so it's transcribed
    # at compile like a picked episode, not scraped from its web page.
    if article.audio_url:
        return DiscoveredItem(
            title=article.title or _episode_title_from_url(article.audio_url),
            url=article.audio_url,
            item_type="podcast",
            source_index=source_index,
            item_index=item_index,
            estimated_duration_s=article.duration_s,
            feed_url=feed_url,
        )
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


def _episode_title_from_url(url: str) -> str:
    """A readable fallback episode title from a bare audio URL: the filename
    without its audio extension (e.g. ".../ep1.mp3" -> "Ep1")."""
    stem = PurePosixPath(urlparse(url).path).stem
    return stem.replace("-", " ").replace("_", " ").strip().title() or url


def _slug_from_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if not path:
        return url
    return path.split("/")[-1].replace("-", " ").replace("_", " ").title()
