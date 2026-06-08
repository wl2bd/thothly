from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl

ItemType = Literal["youtube", "blog"]

JobStatus = Literal[
    "pending",
    "discovering",
    "reviewing",
    "processing",
    "completed",
    "failed",
]


class Source(BaseModel):
    """A source is just a URL — its kind is auto-detected during discovery."""

    url: HttpUrl


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


class JobResponse(BaseModel):
    id: str
    status: JobStatus
    sources: list[Source]
    created_at: datetime
    updated_at: datetime
    book_title: str | None = None
    output_path: str | None = None
    error: str | None = None
    discovered_items: list[DiscoveredItemResponse] = []
