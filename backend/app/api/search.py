from fastapi import APIRouter, Header, Query

from app.search.models import SearchResponse
from app.search.service import search_all

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


def _primary_language(accept_language: str | None) -> str | None:
    """The base language code of the first Accept-Language entry, e.g.
    "fr-FR,fr;q=0.9,en;q=0.8" -> "fr". None when the header is absent/empty."""
    if not accept_language:
        return None
    first = accept_language.split(",", 1)[0].split(";", 1)[0].strip()
    base = first.split("-", 1)[0].strip().lower()
    return base or None
