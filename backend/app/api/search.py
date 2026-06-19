from fastapi import APIRouter, Query

from app.search.models import SearchResponse
from app.search.service import search_all

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query("", description="Free-text search query")) -> SearchResponse:
    """Multi-provider search. Returns an empty result set for a blank query so
    the frontend can call it freely while the user is still typing."""
    query = q.strip()
    if not query:
        return SearchResponse()
    return await search_all(query)
