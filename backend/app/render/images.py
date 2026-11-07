"""Localize remote images so the EPUB stays a self-contained, offline package.

An EPUB is a zip meant to be read offline; a Markdown image that still points
at ``https://…`` produces an EPUBCheck RSC-007 error and won't render on most
e-readers. Pandoc tries to fetch remote images itself, but many sites reject
its downloader (403) and it then silently leaves a broken reference.

So we fetch images ourselves with a browser-like User-Agent, write them next to
the Markdown, and rewrite the references to those local files. Any image we
can't fetch is dropped rather than left as a dead link — the book stays valid.
"""

import hashlib
import io
import logging
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from app.core.net import fetch_public

logger = logging.getLogger(__name__)

# Cap embedded images at a sensible reading width and re-encode them, so a
# 4000px hero photo doesn't bloat the EPUB. Vector (SVG) and possibly-animated
# (GIF) formats are left untouched. Recompression needs Pillow; if it isn't
# importable we embed the original bytes rather than fail.
_MAX_IMAGE_WIDTH = 1600
_PIL_FORMAT = {".jpg": "JPEG", ".png": "PNG", ".webp": "WEBP"}

# ![alt](url "optional title") — title is kept so captions/hover text survive.
# The alt of a figure is its caption, which can hold links: one level of
# [brackets] inside it is part of the alt.
_MD_IMAGE = re.compile(
    r'!\[(?P<alt>(?:[^\[\]]|\[[^\[\]]*\])*)\]\(\s*(?P<url>\S+?)(?P<title>\s+"[^"]*")?\s*\)'
)
_REMOTE = re.compile(r"^https?://", re.IGNORECASE)

_EXT_BY_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}

_MAX_BYTES = 10 * 1024 * 1024  # skip absurdly large downloads (10 MB)


def localize_images(
    markdown: str, media_dir: Path, timeout: float = 30.0
) -> str:
    """Download every remote image in *markdown*, embedding it under *media_dir*.

    Remote references are rewritten to the local file; ones that can't be
    fetched are removed. Local/relative references are left untouched.
    """
    media_dir.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Path | None] = {}

    def replace(match: re.Match[str]) -> str:
        url = match.group("url")
        if not _REMOTE.match(url):
            return match.group(0)  # already local — leave as-is

        if url not in cache:
            cache[url] = _download(url, media_dir, timeout)
        local = cache[url]
        if local is None:
            return ""  # unreachable image: drop rather than break the package

        alt = match.group("alt")
        title = match.group("title") or ""
        return f"![{alt}]({local.as_posix()}{title})"

    return _MD_IMAGE.sub(replace, markdown)


def _download(url: str, media_dir: Path, timeout: float) -> Path | None:
    # Images come from scraped third-party HTML, hence the public-host guard.
    fetched = fetch_public(url, timeout=timeout, max_bytes=_MAX_BYTES)
    if not fetched or not fetched[0]:
        logger.warning("Dropping an image that couldn't be fetched: %s", url)
        return None
    data, headers = fetched
    content_type = headers.get("content-type", "").split(";")[0].strip().lower()

    extension = _EXT_BY_TYPE.get(content_type) or _extension_from_url(url) or ".img"
    data = _recompress(data, extension)
    name = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] + extension
    path = media_dir / name
    path.write_bytes(data)
    return path


def _recompress(data: bytes, extension: str) -> bytes:
    """Downscale oversized raster images and re-encode them; original on failure.

    Only the result is used when it's actually smaller, so already-optimized
    images are never bloated by a needless re-encode.
    """
    fmt = _PIL_FORMAT.get(extension)
    if not fmt:
        return data
    try:
        from PIL import Image

        image = Image.open(io.BytesIO(data))
        image.load()
        if image.width > _MAX_IMAGE_WIDTH:
            height = round(image.height * _MAX_IMAGE_WIDTH / image.width)
            image = image.resize((_MAX_IMAGE_WIDTH, height))

        buffer = io.BytesIO()
        if fmt == "JPEG":
            if image.mode in ("RGBA", "P", "LA"):
                image = image.convert("RGB")
            image.save(buffer, format="JPEG", quality=82, optimize=True)
        elif fmt == "PNG":
            image.save(buffer, format="PNG", optimize=True)
        else:  # WEBP
            image.save(buffer, format="WEBP", quality=82)
    except Exception as exc:  # Pillow missing, or an unreadable/odd image
        logger.warning("Could not recompress image (%s); embedding as-is: %s", fmt, exc)
        return data

    recompressed = buffer.getvalue()
    return recompressed if len(recompressed) < len(data) else data


def _extension_from_url(url: str) -> str | None:
    suffix = Path(url.split("?", 1)[0].split("#", 1)[0]).suffix.lower()
    return suffix if suffix in set(_EXT_BY_TYPE.values()) else None


def _http_bytes(url: str, timeout: float) -> bytes | None:
    fetched = fetch_public(url, timeout=timeout, max_bytes=_MAX_BYTES)
    return fetched[0] if fetched and fetched[0] else None


def favicon_candidates(page_url: str, timeout: float = 15.0) -> list[str]:
    """A site's icon URLs, best first: the largest declared icon
    (apple-touch-icon / <link rel=icon>) so an emblem isn't a blurry 16px
    upscale, then /favicon.ico."""
    from bs4 import BeautifulSoup

    parsed = urlparse(page_url)
    root = f"{parsed.scheme}://{parsed.netloc}"

    candidates: list[tuple[int, str]] = []
    html = _http_get_text(page_url, timeout)
    if html:
        soup = BeautifulSoup(html, "html.parser")
        for link in soup.find_all("link", rel=True):
            rels = " ".join(link.get("rel")).lower()
            href = link.get("href")
            if "icon" in rels and href:
                candidates.append((_parse_icon_size(link.get("sizes")), urljoin(root, href)))
    candidates.sort(key=lambda c: c[0], reverse=True)
    return [url for _, url in candidates] + [urljoin(root, "/favicon.ico")]


def fetch_remote_icon(url: str, dest_path: Path, timeout: float = 15.0) -> Path | None:
    """Download an image URL to *dest_path* as PNG; None on failure, or when
    it's under 48px, too low-res to look good on a cover."""
    from PIL import Image

    data = _http_bytes(url, timeout)
    if not data:
        return None
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        return None
    if max(image.size) < 48:
        return None
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(dest_path, format="PNG")
    return dest_path


def _http_get_text(url: str, timeout: float) -> str | None:
    data = _http_bytes(url, timeout)
    if not data:
        return None
    return data.decode("utf-8", errors="replace")


def _parse_icon_size(sizes: str | None) -> int:
    """Largest dimension from a <link sizes="WxH"> attribute (0 if absent)."""
    if not sizes:
        return 0
    return max((int(n) for n in re.findall(r"\d+", sizes)), default=0)
