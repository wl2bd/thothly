import logging
from urllib.parse import quote, urlparse

import httpx

from app.core.config import settings
from app.search.models import SearchResult

logger = logging.getLogger(__name__)

_TIMEOUT_S = 10.0

# Most results one domain may contribute, so a single prolific site (a Substack
# with dozens of indexed posts) can't crowd out the rest of a topic search.
_MAX_PER_DOMAIN = 3


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

    def search(self, query: str, limit: int) -> list[SearchResult]:
        key = settings.marginalia_api_key or "public"
        url = f"{settings.marginalia_base_url}/{key}/search/{quote(query)}"
        try:
            response = httpx.get(url, params={"count": limit}, timeout=_TIMEOUT_S)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Surfaced by the service layer as a per-provider error.
            raise RuntimeError(f"Web search failed: {exc}") from exc

        results: list[SearchResult] = []
        for entry in payload.get("results", []):
            result = self._to_result(entry)
            if result is not None:
                results.append(result)
        return self._cap_per_domain(results)[:limit]

    def _to_result(self, entry: dict) -> SearchResult | None:
        url = entry.get("url")
        if not url:
            return None
        # `description` is Marginalia's snippet. No author is set: for a web hit
        # the site IS the identity, and it's already carried by the URL (shown as
        # favicon + domain) — a separate author field would just repeat it.
        description = entry.get("description")
        return SearchResult(
            id=f"web:{url}",
            type="web",
            title=entry.get("title") or url,
            url=url,
            source="web",
            meta={"snippet": description} if description else {},
        )

    @staticmethod
    def _cap_per_domain(results: list[SearchResult]) -> list[SearchResult]:
        """Keep at most `_MAX_PER_DOMAIN` hits per host, preserving rank order, so
        one prolific domain can't flood the list on a topic search."""
        kept: list[SearchResult] = []
        per_host: dict[str, int] = {}
        for r in results:
            host = (urlparse(r.url).netloc or "").lower().removeprefix("www.")
            if per_host.get(host, 0) >= _MAX_PER_DOMAIN:
                continue
            per_host[host] = per_host.get(host, 0) + 1
            kept.append(r)
        return kept
