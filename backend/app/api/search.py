import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Header, Query
from fastapi.responses import StreamingResponse

from app.search.models import SearchResponse
from app.search.service import search_all, search_batches

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query("", description="Free-text search query"),
    accept_language: str | None = Header(default=None),
) -> SearchResponse:
    """Multi-provider search. Returns an empty result set for a blank query so
    the frontend can call it freely while the user is still typing.

    The browser's Accept-Language localizes result titles (YouTube) the way an
    anonymous visit would — a French browser gets French titles, etc.
    """
    query = q.strip()
    if not query:
        return SearchResponse()
    return await search_all(query, hl=_primary_language(accept_language))


@router.get("/search/stream")
async def search_stream(
    q: str = Query("", description="Free-text search query"),
    accept_language: str | None = Header(default=None),
) -> StreamingResponse:
    """The same search, streamed: one JSON line per provider (NDJSON), each sent
    the moment that provider answers, so fast sources show up without waiting
    for the slowest. A line is a `ProviderBatch`. A blank query sends nothing."""
    query = q.strip()
    hl = _primary_language(accept_language)

    async def lines() -> AsyncIterator[str]:
        if not query:
            return
        # The 200 is already sent once the first line goes out, so a crash past
        # that point can't become an error status: log it and end the stream
        # cleanly, keeping the batches already delivered.
        try:
            async for batch in search_batches(query, hl=hl):
                yield batch.model_dump_json() + "\n"
        except Exception:  # noqa: BLE001
            logger.exception("Streamed search failed for %r", query)

    return StreamingResponse(
        lines(),
        media_type="application/x-ndjson",
        # Proxies (Fly, Next) must pass each line through as it comes.
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _primary_language(accept_language: str | None) -> str | None:
    """The base language code of the first Accept-Language entry, e.g.
    "fr-FR,fr;q=0.9,en;q=0.8" -> "fr". None when the header is absent, empty or
    not a language — `*` is a valid header value but YouTube rejects it as a
    `lang`, which fails the whole provider, so anything non-alphabetic is None."""
    if not accept_language:
        return None
    first = accept_language.split(",", 1)[0].split(";", 1)[0].strip()
    base = first.split("-", 1)[0].strip().lower()
    return base if base.isalpha() else None
