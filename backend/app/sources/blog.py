import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime
from time import struct_time
from urllib.error import URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import feedparser
import trafilatura
from bs4 import BeautifulSoup

from app.core.config import settings
from app.core.net import BlockedURLError, assert_public_url
from app.sources.models import Article

logger = logging.getLogger(__name__)

# A browser-like User-Agent. trafilatura's own downloader is rejected outright
# by some hosts (returns nothing), even though the page loads fine in a normal
# client — so we keep this for a fallback fetch.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


class FeedUnavailable(Exception):
    pass


class ScrapeUnavailable(Exception):
    pass


def list_feed(feed_url: str) -> tuple[str | None, list[Article]]:
    """Return the (feed title, articles) for an RSS/Atom feed."""
    assert_public_url(feed_url)  # SSRF guard: never fetch an internal address
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

    downloaded = _unwrap_image_links(downloaded)

    # include_formatting/include_links keep bold, italics and hyperlinks (both
    # default to False, which would flatten the article to plain text). Tables
    # are kept by trafilatura's include_tables default. include_images keeps the
    # article's figures; the EPUB renderer downloads and embeds them, dropping
    # any that can't be fetched. This preserves the author's structure and
    # emphasis in the EPUB without any LLM involvement.
    # favor_recall keeps the full article body. The default (precision-first)
    # mode can latch onto one dense block — e.g. a large embedded code sample —
    # and discard the surrounding prose, so the EPUB shows only that block.
    content_html = trafilatura.extract(
        downloaded,
        output_format="html",
        url=url,
        include_formatting=True,
        include_links=True,
        include_images=True,
        favor_recall=True,
    )
    if not content_html:
        raise ScrapeUnavailable(f"Could not extract content from: {url}")

    content_html = _clean_extracted_html(content_html, url)

    title, author, published_at = _extract_metadata(downloaded, url)
    return Article(
        url=url,
        title=title,
        published_at=published_at,
        author=author,
        content_html=content_html,
    )


def _unwrap_image_links(html: str) -> str:
    """Unwrap <a> elements whose only content is an image, before extraction.

    Many CMSs (Substack chief among them) wrap each content image in a
    "click to enlarge" link: <a href="…big.png"><img …></a>. trafilatura's
    link-density filter then treats the whole figure as boilerplate and prunes
    it, so the article's images silently vanish from the extraction. Removing
    just the wrapping anchor — keeping the image and any caption — lets the
    figure survive. Only image-only anchors are unwrapped, so genuine text
    links (which may legitimately contain a small icon) are left intact.
    """
    if "<img" not in html and "<picture" not in html:
        return html
    soup = BeautifulSoup(html, "html.parser")
    changed = False
    for anchor in soup.find_all("a"):
        if anchor.find(["img", "picture"]) and not anchor.get_text(strip=True):
            anchor.unwrap()
            changed = True
    return str(soup) if changed else html


def _clean_extracted_html(html: str, base_url: str) -> str:
    """Tidy trafilatura's extracted HTML before it becomes Markdown.

    Four fixes:
    - Images: trafilatura emits figures as TEI <graphic> elements (even with
      output_format="html"), which markdownify doesn't recognise — so every
      image silently vanishes on the way to Markdown. We rewrite them to <img>
      so they survive (and the EPUB renderer can embed them), dropping the
      duplicate trafilatura emits for each linked image (one inside its <a>, one
      bare). Every image src is then resolved to an absolute URL against the
      page: trafilatura often leaves them site-root-relative (e.g.
      "/post/./fig.jpg"), which the renderer would mistake for a local file and
      leave as a dead link.
    - Code tables: syntax highlighters (Chroma/Hugo lntable, Pygments…) lay a
      code block out as a table with a line-number gutter column. Left alone it
      flattens into a garbage row (line numbers in one cell, code mashed in the
      other). We collapse any table/row containing a <pre> into a real code
      block, dropping the pure line-number gutter.
    - Tables: trafilatura emits <table><row><cell role="head"><p>…</p></cell>…,
      which markdownify doesn't recognise — the cells flatten into loose text.
      We map <row>→<tr>, <cell role="head">→<th>, <cell>→<td> and flatten each
      cell to inline text so markdownify produces a real pipe table.
    - Empty code blocks: interactive widgets often extract as empty <code>/<pre>,
      which render as ugly empty boxes; we drop them.
    """
    if not any(tag in html for tag in ("<graphic", "<img", "<row", "<cell", "<code", "<pre")):
        return html  # standard HTML with nothing to fix (e.g. RSS content)

    soup = BeautifulSoup(html, "html.parser")

    # <graphic> → <img>, deduped by scheme-insensitive URL (same image is often
    # emitted twice: once protocol-relative inside its <a>, once bare as http:).
    seen_images: set[str] = set()
    for graphic in soup.find_all("graphic"):
        src = (graphic.get("src") or "").strip()
        key = re.sub(r"^https?:", "", src)
        if not src or key in seen_images:
            graphic.decompose()
            continue
        seen_images.add(key)
        img = soup.new_tag("img", src=src)
        if graphic.get("alt"):
            img["alt"] = graphic["alt"]
        graphic.replace_with(img)

    # Absolutize every image URL against the page (skipping data: URIs, which
    # are already self-contained) so the EPUB renderer can fetch and embed it.
    for img in soup.find_all("img"):
        src = (img.get("src") or "").strip()
        if src and not src.startswith("data:"):
            img["src"] = urljoin(base_url, src)

    # Code-layout tables first, before the generic <row>/<cell> rewrite below.
    for container in soup.find_all(["table", "row"]):
        pres = container.find_all("pre")
        if not pres:
            continue
        code_parts = [
            pre.get_text().rstrip("\n")
            for pre in pres
            # drop the line-number gutter (a <pre> of only digits/whitespace)
            if pre.get_text().strip() and not re.fullmatch(r"[\s\d]+", pre.get_text())
        ]
        replacement = soup.new_tag("pre")
        if code_parts:
            replacement.string = "\n".join(code_parts)
        container.replace_with(replacement)

    for cell in soup.find_all("cell"):
        cell.name = "th" if cell.get("role") == "head" else "td"
        if cell.has_attr("role"):
            del cell["role"]
        # Pipe-table cells can't hold block elements; collapse to inline text.
        text = cell.get_text(" ", strip=True)
        cell.clear()
        if text:
            cell.append(text)
    for row in soup.find_all("row"):
        row.name = "tr"
        if row.has_attr("span"):
            del row["span"]
    for code in soup.find_all(["code", "pre"]):
        if not code.get_text(strip=True):
            code.decompose()
    return str(soup)


def _fetch_url(url: str, timeout: float) -> str | None:
    """Download a page's HTML, robustly.

    trafilatura.fetch_url (no timeout of its own, so we bound it with a worker
    thread) is tried first; some hosts reject its downloader and return nothing
    even though the page is perfectly reachable, so we then retry with a
    browser-like User-Agent before giving up.
    """
    try:
        assert_public_url(url)  # SSRF guard: never fetch an internal address
    except BlockedURLError as exc:
        logger.warning("Refusing to fetch non-public URL %s: %s", url, exc)
        return None

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(trafilatura.fetch_url, url)
        try:
            downloaded = future.result(timeout=timeout)
        except FuturesTimeoutError:
            logger.warning("Timed out downloading %s after %ss", url, timeout)
            downloaded = None

    if downloaded:
        return downloaded

    logger.info("trafilatura fetched nothing for %s; retrying with browser UA", url)
    return _browser_fetch(url, timeout)


def _browser_fetch(url: str, timeout: float) -> str | None:
    try:
        request = Request(
            url,
            headers={"User-Agent": _BROWSER_UA, "Accept-Language": "fr,en;q=0.8"},
        )
        with urlopen(request, timeout=timeout) as response:
            raw = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")
    except (URLError, ValueError, OSError) as exc:
        logger.warning("Browser-UA fetch failed for %s: %s", url, exc)
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
