from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, SecretStr

from app.sources.models import DiscoveredItem, ItemType, SourceSpec

JobStatus = Literal["discovering", "reviewing", "processing", "completed", "failed"]

CompileState = Literal["pending", "compiling", "done", "skipped", "failed"]


class Source(SourceSpec):
    # The source's real name (playlist/channel/feed/site title), so review can
    # label each group by it instead of the raw URL. Absent until discovered.
    name: str | None = None
    # Written as each source resolves, so the loading screen shows per-source
    # progress: `resolved` flips once it is done, `item_count` is what it yielded.
    resolved: bool = False
    item_count: int = 0
    # Why this source yielded nothing, when it failed. The others still go on:
    # one unreadable site must not sink a whole compilation.
    error: str | None = None


# A single job fans out to one background worker that processes every source
# sequentially, and each source can enumerate up to `max_items_per_source`
# items — so an unbounded source count is an easy resource-exhaustion vector.
# The frontend reads both limits from the API schema.
MAX_SOURCES_PER_JOB = 5
BOOK_TITLE_MAX = 100


class JobCreate(BaseModel):
    sources: Annotated[
        list[SourceSpec], Field(min_length=1, max_length=MAX_SOURCES_PER_JOB)
    ]
    # Named in the workspace before discovery. Absent = derived from the sources.
    book_title: Annotated[str | None, Field(max_length=BOOK_TITLE_MAX)] = None


class VisitorEndpoint(BaseModel):
    """A visitor's own provider, key and model, sent from the browser for one
    job. Ridden in the confirm body rather than a header: bodies reach proxy
    traces far less often. SecretStr keeps the key out of any repr or log."""

    provider: str
    api_key: SecretStr | None = None
    model: Annotated[str, Field(max_length=200)]
    base_url: str | None = None  # read only for "custom", when the server allows it


class ItemLanguage(BaseModel):
    """The caption language a reader picks for one video at review: a base code
    from the item's `transcript_tracks`."""

    language: Annotated[str, Field(min_length=2, max_length=16)]


class JobConfirm(BaseModel):
    selected_ids: Annotated[list[str], Field(min_length=1)]
    book_title: Annotated[str | None, Field(max_length=BOOK_TITLE_MAX)] = None
    # Selected LLM role ids (see app/pipeline/roles.py). Empty = zero-LLM compile.
    llm_roles: list[str] = []
    # The visitor's own model and transcription endpoints. Absent = the server's.
    llm: VisitorEndpoint | None = None
    stt: VisitorEndpoint | None = None


class DiscoveredItemResponse(DiscoveredItem):
    id: str
    selected: bool = False
    # How this item fared in the compile, from the moment the visitor confirms.
    # None on items that weren't part of it. `skipped` means there was nothing
    # usable to build from, `failed` that something broke; both carry a short,
    # user-facing reason in `compile_note`, which while `compiling` names the
    # stage the item is in.
    compile_state: CompileState | None = None
    compile_note: str | None = None


class ItemPreview(BaseModel):
    """The no-LLM content a discovered item would contribute, for the review
    screen. Mirrors the compiler's zero-LLM path exactly, so `content_md` is what
    actually lands in the EPUB when no AI cleanup role is chosen — not a guess.

    `available` is False when there's nothing free to show (a podcast awaiting
    transcription, a video without subtitles, an unscrapable page); `note` then
    explains why. `note` is also set on an *available* preview to flag a caveat
    (e.g. an article that fell back to its feed summary). `truncated` marks a
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
    # The title was typed by the user when the job was created.
    title_named: bool = False
    # The finished EPUB's size, once the job has completed.
    epub_bytes: int | None = None
    error: str | None = None
    discovered_items: list[DiscoveredItemResponse] = []
