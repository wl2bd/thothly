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
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

# Cap embedded images at a sensible reading width and re-encode them, so a
# 4000px hero photo doesn't bloat the EPUB. Vector (SVG) and possibly-animated
# (GIF) formats are left untouched. Recompression needs Pillow; if it isn't
# importable we embed the original bytes rather than fail.
_MAX_IMAGE_WIDTH = 1600
_PIL_FORMAT = {".jpg": "JPEG", ".png": "PNG", ".webp": "WEBP"}

# ![alt](url "optional title") — title is kept so captions/hover text survive.
_MD_IMAGE = re.compile(
    r'!\[(?P<alt>[^\]]*)\]\(\s*(?P<url>\S+?)(?P<title>\s+"[^"]*")?\s*\)'
)
_REMOTE = re.compile(r"^https?://", re.IGNORECASE)

# A real browser UA: plenty of hosts 403 anything that looks like a bot/library.
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

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
    try:
        request = Request(url, headers={"User-Agent": _USER_AGENT})
        with urlopen(request, timeout=timeout) as response:
            content_type = response.headers.get_content_type()
            data = response.read(_MAX_BYTES + 1)
    except (URLError, ValueError, OSError) as exc:
        logger.warning("Dropping unreachable image %s: %s", url, exc)
        return None

    if len(data) > _MAX_BYTES:
        logger.warning("Dropping oversized image %s (> %d bytes)", url, _MAX_BYTES)
        return None
    if not data:
        logger.warning("Dropping empty image %s", url)
        return None

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
