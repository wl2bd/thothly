"""The cover a visitor sets at review: how their settings reach the book, and
the thumbnail the review screen shows while they set it."""

import hashlib
import io
import os
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

from app.core.config import settings
from app.jobs.cover_image import cover_image_path
from app.jobs.emblem import emblem_urls
from app.jobs.models import CoverSettings, DiscoveredItemResponse
from app.pipeline.models import CompiledBook, CompiledChapter
from app.render.cover import CoverDesign, generate_cover
from app.render.images import fetch_remote_icon
from app.sources import transcript_cache
from app.sources.youtube.common import video_id

# The review thumbnail: a third of the real cover, plenty for a side pane.
PREVIEW_SIZE = (532, 852)


def parse_authors(line: str | None) -> list[str] | None:
    """A typed line of names, split on commas. Blank = None: credit the sources."""
    if line is None or not line.strip():
        return None
    names = [name for name in (part.strip() for part in line.split(",")) if name]
    return names or None


def design_for(job_id: str, cover: CoverSettings) -> CoverDesign:
    image = cover_image_path(job_id)
    return CoverDesign(
        tint=cover.tint,
        emblem=cover.emblem,
        subtitle=(cover.subtitle or "").strip() or None,
        background=image if image.exists() else None,
    )


def apply_to_book(book: CompiledBook, cover: CoverSettings) -> None:
    book.subtitle = (cover.subtitle or "").strip() or None
    book.authors = parse_authors(cover.authors)


def render_preview(
    job_id: str, title: str, cover: CoverSettings, items: list[DiscoveredItemResponse]
) -> bytes:
    """The cover as the compile would draw it now, as a small JPEG.

    Built from what review knows: a video's channel comes from its cached
    transcript, never a new YouTube call, and an article's author is only read
    at compile, so a blog book shows its authors once compiled."""
    book = CompiledBook(
        title=title.strip() or "Untitled",
        generated_at=datetime.now(timezone.utc),
        chapters=[_stand_in(item) for item in items],
    )
    apply_to_book(book, cover)
    design = design_for(job_id, cover)
    emblem = _source_emblem(book) if design.emblem == "source" else None
    with tempfile.TemporaryDirectory(prefix="thothly-cover-") as tmp:
        path = generate_cover(book.title, book.credited_authors, Path(tmp) / "c.png", emblem, design)
        image = Image.open(path).convert("RGB")
        image.thumbnail(PREVIEW_SIZE, Image.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=85)
    return out.getvalue()


def _stand_in(item: DiscoveredItemResponse) -> CompiledChapter:
    author = channel = None
    if item.item_type == "youtube":
        transcript = transcript_cache.get(video_id(item.url))
        if transcript is not None:
            author, channel = transcript.uploader, transcript.channel_url
    return CompiledChapter(
        title=item.title,
        source_type=item.item_type,
        source_url=item.url,
        author=author,
        channel_url=channel,
        content_md="",
    )


# Origin → its fetched emblem. The preview is redrawn each time the visitor
# pauses; the icon lookup behind it is a page fetch or a YouTube call, so one
# request per origin does it (the others wait on its lock) and the rest reuse
# the file. A miss is remembered briefly only: a timeout must not leave the
# preview showing a different emblem than the compile will find.
_FOUND: dict[str, Path] = {}
_MISSED: dict[str, float] = {}
_MISS_TTL_S = 300
_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def _source_emblem(book: CompiledBook) -> Path | None:
    origins = sorted(
        {urlparse(c.source_url).netloc for c in book.chapters if c.source_type == "blog"}
        | {c.channel_url or "" for c in book.chapters if c.source_type == "youtube"}
    )
    key = hashlib.sha1("|".join(origins).encode()).hexdigest()
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(key, threading.Lock())
    with lock:
        if key in _FOUND and _FOUND[key].exists():
            return _FOUND[key]
        if time.monotonic() - _MISSED.get(key, -_MISS_TTL_S) < _MISS_TTL_S:
            return None
        dest = settings.data_dir / "covers" / "emblems" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(".part.png")
        if next((p for url in emblem_urls(book) if (p := fetch_remote_icon(url, tmp))), None):
            os.replace(tmp, dest)
            _FOUND[key] = dest
            return dest
        _MISSED[key] = time.monotonic()
        return None
