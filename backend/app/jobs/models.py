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
