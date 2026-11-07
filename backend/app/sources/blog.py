import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime
from time import struct_time
from urllib.parse import urljoin

import feedparser
import trafilatura
from trafilatura.htmlprocessing import build_html_output
from trafilatura.utils import normalize_unicode
from bs4 import BeautifulSoup

from app.core.config import settings
from app.core.net import BlockedURLError, assert_public_url, fetch_public_text
from app.pipeline.i18n import normalize_language
from app.sources.models import Article
from app.sources.wikipedia import WikipediaUnavailable, is_wikipedia_article, scrape_wikipedia

logger = logging.getLogger(__name__)

# A page bigger than this is not an article.
_MAX_PAGE_BYTES = 20 * 1024 * 1024


# No data table has a cell this long; a page laid out in a table does.
_LAYOUT_CELL_CHARS = 1000

# Elements that hold running text: a <pre> inside one is inline code.
_INLINE_CONTEXT = ["p", "li", "td", "th", "cell", "h1", "h2", "h3", "h4", "h5", "h6",
                   "a", "strong", "b", "em", "i", "u", "del", "sup", "sub"]


class FeedUnavailable(Exception):
    pass


class ScrapeUnavailable(Exception):
    pass


class Paywalled(Exception):
    """The page loaded, but its text is for subscribers: what's public is a
    teaser, and compiled it would pass for a whole article cut short."""


# A paid newsletter post's subscribe box (Substack and its clones), or the
# schema.org flag publishers set for search engines on paywalled articles.
_PAYWALL_BOX = re.compile(r'class="paywall["\s]')
_NOT_FREE = re.compile(r'"isAccessibleForFree"\s*:\s*(false|"false")', re.IGNORECASE)


# A paid newsletter post in its feed: the opening, cut, then a lone "Read more"
# link back to the post. Trusted on Substack feeds only: an excerpt-only blog
# ends its free posts the same way.
_READ_MORE = re.compile(r'<a\s[^>]*href="([^"]+)"[^>]*>\s*Read more\s*</a>\s*</p>\s*$', re.IGNORECASE)


def _ends_on_read_more(content_html: str, url: str) -> bool:
    m = _READ_MORE.search(content_html or "")
    return bool(m) and m.group(1).rstrip("/") == url.rstrip("/")


def _is_paywalled(html: str) -> bool:
    return bool(_PAYWALL_BOX.search(html) or _NOT_FREE.search(html))


def list_feed(feed_url: str) -> tuple[str | None, list[Article]]:
    """Return the (feed title, articles) for an RSS/Atom feed."""
    assert_public_url(feed_url)  # SSRF guard: never fetch an internal address
    result = feedparser.parse(feed_url)
    status = getattr(result, "status", 200)
    if status is not None and status >= 400:
        raise FeedUnavailable(f"HTTP {status} fetching {feed_url}")
    feed = getattr(result, "feed", None)
    title = (feed.get("title") if feed else None) or None
    articles = [_entry_to_article(entry) for entry in result.entries]
    if "substack" in ((feed.get("generator") if feed else None) or "").lower():
        for article in articles:
            article.paywalled = _ends_on_read_more(article.content_html, article.url)
    return title, articles


def scrape_article(url: str, downloaded: str | None = None) -> Article:
    """Extract a single article's content from its page via trafilatura.

    Used for blogs without an RSS feed, or to recover the full text of an
    article whose feed only provided a truncated summary. `downloaded` is the
    page when the caller already has it.
    """
    if is_wikipedia_article(url):
        try:
            return scrape_wikipedia(url, settings.scrape_timeout_s)
        except WikipediaUnavailable as exc:
            logger.warning("Wikipedia API failed for %s, scraping the page instead: %s", url, exc)

    downloaded = downloaded or fetch_page(url, settings.scrape_timeout_s)
    if not downloaded:
        raise ScrapeUnavailable(f"Failed to download page: {url}")
    if _is_paywalled(downloaded):
        raise Paywalled(url)

    downloaded = _captions_to_titles(_unwrap_image_links(_drop_site_chrome(downloaded)))

    # include_formatting/include_links keep bold, italics and hyperlinks (both
    # default to False, which would flatten the article to plain text). Tables
    # are kept by trafilatura's include_tables default. include_images keeps the
    # article's figures; the EPUB renderer downloads and embeds them, dropping
    # any that can't be fetched. This preserves the author's structure and
    # emphasis in the EPUB without any LLM involvement.
    # favor_recall keeps the full article body. The default (precision-first)
    # mode can latch onto one dense block — e.g. a large embedded code sample —
    # and discard the surrounding prose, so the EPUB shows only that block.
    content_html = _extract_html(downloaded, url)
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
        language=_html_language(downloaded),
    )


def _extract_html(downloaded: str, url: str) -> str | None:
    """trafilatura.extract(output_format="html"), keeping numbered lists.

    Its HTML writer turns every list into <ul>, though its own tree still marks
    a numbered one (<list rend="ol">). Renaming those to <ol> before the writer
    runs keeps the numbers; everything else is what extract() would return.
    """
    document = trafilatura.bare_extraction(
        downloaded,
        url=url,
        include_formatting=True,
        include_links=True,
        include_images=True,
        favor_recall=True,
    )
    if document is None or document.body is None:
        return None
    for lst in document.body.iter("list"):
        if lst.get("rend") == "ol":
            lst.tag = "ol"
            lst.attrib.clear()
    return normalize_unicode(build_html_output(document))


_HTML_LANG = re.compile(r"<html\b[^>]*?\b(?:xml:)?lang\s*=\s*[\"']?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)", re.I)


def _html_language(html: str) -> str | None:
    """The primary language a page declares on its <html> element."""
    match = _HTML_LANG.search(html[:5000])
    return normalize_language(match.group(1)) if match else None


_CHROME = re.compile(r"<(header|nav|footer)\b", re.IGNORECASE)


def _drop_site_chrome(html: str) -> str:
    """Remove the site's own header, menus and footer before extraction.

    favor_recall keeps text trafilatura would otherwise prune, and on a page
    with no <article> that includes the site header: a magazine's drop-down
    menu (a promo for its current issue, its tagline) became the article's
    opening. Only page-level ones go: an <article>'s or <main>'s own header
    holds its title and standfirst.
    """
    if not _CHROME.search(html):
        return html
    soup = BeautifulSoup(html, "html.parser")
    chrome = [
        el for el in soup.find_all(["header", "nav", "footer"])
        if not el.find_parent(["article", "main"]) and not el.find(["article", "main"])
    ]
    for el in chrome:
        if not el.decomposed:
            el.decompose()
    return str(soup) if chrome else html


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


# A figure's caption: HTML5, then the WordPress classic editor's.
_CAPTION = "figcaption, .wp-caption-text"


def _captions_to_titles(html: str) -> str:
    """Carry each figure's caption on its image's title, before extraction.

    trafilatura drops <figcaption> and keeps a WordPress caption as one more
    paragraph, but it keeps an image's title. The caption moves there (and
    leaves the page); _clean_extracted_html turns it back into a <figcaption>.
    Other titles (hover text, file names) are cleared so a title always means a
    caption.
    """
    if "<img" not in html:
        return html
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img", title=True):
        del img["title"]
    for figure in soup.select("figure, .wp-caption"):
        images = figure.find_all("img")
        caption = figure.select_one(_CAPTION)
        if len(images) == 1 and caption and caption.get_text(strip=True):
            images[0]["title"] = " ".join(caption.get_text().split())
            caption.decompose()
    return str(soup)


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

    # trafilatura writes every code element as <pre>: a block (<pre><code>)
    # comes out as <pre><pre>, inline <code> as a <pre> inside its paragraph.
    # A block keeps only its inner <pre>'s text (the space around it is
    # trafilatura's pretty-printing); a one-line <pre> inside text is inline
    # code again. Both before the code-table pass, which reads any <pre> as a
    # code layout.
    for pre in soup.find_all("pre"):
        inner = pre.find_all("pre")
        if inner and not pre.find_parent("pre"):
            pre.string = "\n".join(p.get_text() for p in inner)
    for pre in soup.find_all("pre"):
        if pre.find_parent(_INLINE_CONTEXT) and "\n" not in pre.get_text():
            pre.name = "code"

    # <graphic> → <img>, deduped by scheme-insensitive URL (same image is often
    # emitted twice: once protocol-relative inside its <a>, once bare as http:).
    seen_images: set[str] = set()
    for graphic in soup.find_all("graphic"):
        src = (graphic.get("src") or "").strip()
        key = re.sub(r"^https?:", "", src)
        # A 1-pixel spacer GIF from a table layout is not a figure.
        spacer = any((graphic.get(d) or "").strip() in ("0", "1", "2") for d in ("width", "height"))
        if not src or key in seen_images or spacer:
            graphic.decompose()
            continue
        seen_images.add(key)
        img = soup.new_tag("img", src=src)
        if graphic.get("alt"):
            img["alt"] = graphic["alt"]
        caption = (graphic.get("title") or "").strip()
        if caption:  # set by _captions_to_titles
            figure = soup.new_tag("figure")
            figure.append(img)
            figure.append(soup.new_tag("figcaption"))
            figure.figcaption.string = caption
            img = figure
        graphic.replace_with(img)

    # Absolutize every image URL against the page (skipping data: URIs, which
    # are already self-contained) so the EPUB renderer can fetch and embed it.
    for img in soup.find_all("img"):
        src = (img.get("src") or "").strip()
        if src and not src.startswith("data:"):
            img["src"] = urljoin(base_url, src)

    # Layout tables before anything reads a table as data. Old sites
    # (paulgraham.com) put the whole article in one cell, sometimes as a bare
    # <row> with no <table> around it. A cell holding several paragraphs or a
    # page of text is layout, not data, so the container gives way to its
    # content. One left with no text and no image (spacer GIFs) is dropped.
    for container in soup.find_all(["table", "row"]):
        if container.decomposed:
            continue
        cells = container.find_all(["cell", "td", "th"])
        if not container.get_text(strip=True) and not container.find("img"):
            container.decompose()
        elif any(len(c.find_all("p")) > 1 or len(c.get_text(strip=True)) > _LAYOUT_CELL_CHARS
                 for c in cells):
            for cell in cells:
                for child in list(cell.contents):
                    container.insert_before(child)
            container.decompose()

    # Code-layout tables next, before the generic <row>/<cell> rewrite below.
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


def fetch_page(url: str, timeout: float) -> str | None:
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

    # No `with` block: leaving it joins the worker, so a download that never
    # finishes would block here forever and the timeout would mean nothing.
    # A hung download is abandoned to its thread instead.
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(trafilatura.fetch_url, url)
    try:
        downloaded = future.result(timeout=timeout)
    except FuturesTimeoutError:
        logger.warning("Timed out downloading %s after %ss", url, timeout)
        downloaded = None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    if downloaded:
        return downloaded

    logger.info("trafilatura fetched nothing for %s; retrying with browser UA", url)
    return _browser_fetch(url, timeout)


def _browser_fetch(url: str, timeout: float) -> str | None:
    return fetch_public_text(url, timeout=timeout, max_bytes=_MAX_PAGE_BYTES)


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
        audio_url=_audio_enclosure(entry),
        duration_s=_parse_duration(getattr(entry, "itunes_duration", None)),
    )


def _audio_enclosure(entry) -> str | None:
    for enclosure in getattr(entry, "enclosures", []):
        if (enclosure.get("type") or "").startswith("audio/") and enclosure.get("href"):
            return enclosure["href"]
    return None


def _parse_duration(raw: str | None) -> int | None:
    """itunes:duration is seconds ("1800") or clock time ("30:00", "1:02:03")."""
    try:
        seconds = 0
        for part in str(raw).strip().split(":"):
            seconds = seconds * 60 + int(float(part))
        return seconds or None
    except (TypeError, ValueError):
        return None


def _parse_struct_time(t: struct_time | None) -> datetime | None:
    if t is None:
        return None
    try:
        return datetime(*t[:6])
    except (TypeError, ValueError):
        return None
