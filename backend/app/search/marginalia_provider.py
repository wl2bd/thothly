from urllib.parse import quote

import httpx

from app.core.config import settings
from app.search.models import SearchResult
from app.search.web import web_result

# Kept short: Marginalia answers slowly at times, and the web slot would rather
# fail fast than hold its results back.
_TIMEOUT_S = 6.0


class MarginaliaProvider:
    """Web-article search via Marginalia's keyless public API.

    Marginalia indexes the independent "small web" — blogs, documentation,
    long-form text — and deliberately downranks SEO/commercial pages, which fits
    a reading compiler far better than a general engine. Crucially it doesn't
    rate-limit a couple of queries to death the way scraping DuckDuckGo's HTML
    endpoint does, which is why it's the default web backend.

    Emits `web` results: a picked one is just an article URL, which the existing
    discovery flow already handles (detect_kind -> "blog" -> text extraction).
    The "public" key shares one tight rate limit across all callers; set
    MARGINALIA_API_KEY to a personal/commercial key for headroom (and, on a
    commercial key, no non-commercial restriction).
    """

    name = "web"

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        key = settings.marginalia_api_key or "public"
        url = f"{settings.marginalia_base_url}/{key}/search/{quote(query)}"
        try:
            response = httpx.get(url, params={"count": limit}, timeout=_TIMEOUT_S)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"Web search failed: {exc}") from exc

        # `description` is Marginalia's snippet.
        return [
            web_result(e["url"], e.get("title"), e.get("description"))
            for e in payload.get("results", [])[:limit]
            if e.get("url")
        ]
