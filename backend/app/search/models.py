from typing import Any, Literal

from pydantic import BaseModel, Field

# What kind of thing a result is. Drives the downstream pipeline once the result
# becomes a source: video/episode -> audio transcription, web -> text
# extraction, playlist/channel -> expanded into many items first. The set is
# deliberately broad so podcast/web providers slot in without a schema change.
ResultType = Literal["video", "playlist", "channel", "podcast", "episode", "web"]

# Which provider produced the result — drives the source badge in the UI.
ResultSource = Literal["youtube", "podcast", "web"]


class SearchResult(BaseModel):
    """One normalized hit from any provider.

    Every provider maps its native payload onto this single shape so the
    frontend renders one unified list regardless of origin. `meta` carries
    provider-specific extras (item counts, view counts, channel URL…) without
    bloating the common schema.
    """

    id: str  # globally unique, namespaced by provider (e.g. "youtube:dQw4w9WgXcQ")
    type: ResultType
    title: str
    url: str
    thumbnail: str | None = None
    duration_s: int | None = None
    author: str | None = None  # channel name / podcast / site author
    source: ResultSource
    meta: dict[str, Any] = Field(default_factory=dict)


class ProviderError(BaseModel):
    """A single provider's failure, surfaced so the UI can show a partial-error
    banner while still rendering the providers that succeeded."""

    provider: str
    message: str


class ProviderBatch(BaseModel):
    """One provider's share of a streamed search, sent as soon as it finishes.

    `error` is set when the provider failed or timed out; its results are then
    empty and the other providers' batches still arrive."""

    provider: str
    results: list[SearchResult] = Field(default_factory=list)
    error: str | None = None


class SearchResponse(BaseModel):
    results: list[SearchResult] = Field(default_factory=list)
    errors: list[ProviderError] = Field(default_factory=list)
