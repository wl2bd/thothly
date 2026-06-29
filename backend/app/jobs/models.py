from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl

ItemType = Literal["youtube", "blog", "podcast"]

JobStatus = Literal[
    "pending",
    "discovering",
    "reviewing",
    "processing",
    "completed",
    "failed",
]


class Source(BaseModel):
    """A source is a URL; its kind is auto-detected during discovery.

    The search-staging flow may add optional hints a pasted URL can't supply: a
    picked podcast episode sets kind="podcast" (its audio enclosure URL isn't
    self-identifying) and carries the episode title (not derivable from the URL).
    Both are ignored for kinds that re-derive their own metadata (youtube, blog).
    """

    url: HttpUrl
    kind: str | None = None
    title: str | None = None
    # Episode length (seconds) from the podcast search result. The audio isn't
    # probed at discovery (transcription is deferred), so this is the only place
    # the duration is known — it drives the review screen's reading/cost figures.
    duration_s: int | None = None
    # The source's human name (playlist/channel/feed/site title), captured during
    # discovery and written back so the review screen can label each source group
    # by its real name instead of the raw URL. Absent until discovery has run.
    name: str | None = None
    # Per-source discovery progress, written incrementally as each source
    # resolves (discovery runs sequentially) so the loading screen can show a
    # live per-source state instead of one opaque spinner. `resolved` flips true
    # once this source is done (success or empty); `item_count` is how many items
    # it yielded.
    resolved: bool = False
    item_count: int = 0


class JobCreate(BaseModel):
    sources: Annotated[list[Source], Field(min_length=1)]


class JobConfirm(BaseModel):
    selected_ids: Annotated[list[str], Field(min_length=1)]
    book_title: str | None = None
    # Selected LLM role ids (see app/pipeline/roles.py). Empty = zero-LLM compile.
    llm_roles: list[str] = []


class DiscoveredItemResponse(BaseModel):
    id: str
    source_index: int
    item_index: int
    item_type: ItemType
    title: str
    url: str
    estimated_duration_s: int | None = None
    estimated_size_chars: int | None = None
    preview_html: str | None = None
    selected: bool = False

    # Per-item reading info computed at discovery (YouTube). has_transcript is
    # tri-state: True = usable subtitles, False = none (item will be skipped),
    # None = unknown (couldn't reach YouTube). is_punctuated drives whether the
    # transcript reads cleanly as-is or needs an LLM cleanup pass. The transcript
    # text itself isn't stored here — it lives in the video-keyed transcript
    # cache, which compilation reads back (with full timing + chapters).
    has_transcript: bool | None = None
    transcript_lang: str | None = None
    is_punctuated: bool | None = None
    word_count: int | None = None
    reading_time_min: int | None = None


class ItemPreview(BaseModel):
    """The no-LLM content a discovered item would contribute, for the review
    screen. Mirrors the compiler's zero-LLM path exactly, so `content_md` is what
    actually lands in the EPUB when no AI cleanup role is chosen — not a guess.

    `available` is False when there's nothing free to show (a podcast awaiting
    transcription, a video without subtitles, an unscrapable page); `note` then
    explains why. `note` is also set on an *available* preview to flag a caveat
    (e.g. raw captions the final compile would punctuate). `truncated` marks a
    long body clipped for transport — the compile still uses the full text.
    """

    item_id: str
    item_type: ItemType
    available: bool
    content_md: str | None = None
    truncated: bool = False
    note: str | None = None


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    sources: list[Source]
    created_at: datetime
    updated_at: datetime
    book_title: str | None = None
    output_path: str | None = None
    # Standalone Markdown twin of the EPUB content (zero-LLM), for feeding the
    # compilation to an AI or any plain-text tool. Set once the job completes.
    output_md_path: str | None = None
    error: str | None = None
    discovered_items: list[DiscoveredItemResponse] = []
