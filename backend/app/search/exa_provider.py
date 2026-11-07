import logging

from app.core import gateway
from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.search.models import SearchResult
from app.search.web import web_result

logger = logging.getLogger(__name__)

_TIMEOUT_S = 10.0
_SNIPPET_CHARS = 300

EXA = gateway.Route(treg="exa.web.search", monid_provider="exa", monid_endpoint="/search",
                     cache_ttl_s=gateway.SEARCH_TTL_S)
TINYFISH = gateway.Route(
    treg="tinyfish.web.search", monid_provider="tinyfish", monid_endpoint="/free/search",
    cache_ttl_s=gateway.SEARCH_TTL_S,
)
# Sent to TinyFish as a ranking hint: Thothly wants pages to read, not portals.
_PURPOSE = "find long-form articles or explainers a reader can learn from, to compile into a book"


class ExaProvider:
    """Web-article search via Exa and TinyFish, each the other's fallback.

    Exa searches by meaning, so on a reading query it surfaces course notes,
    essays and reviews where a keyword engine returns vendor pages (measured on
    five searches against Brave, 2026-11-04). Both go through the data gateway
    (treg, then Monid), so neither needs its own key. TinyFish is free but
    keyword-ranked and slower.

    `free_first` puts TinyFish in front and keeps Exa for when it fails. The
    search runs as the visitor types, several queries per search, so a metered
    first choice bills every keystroke pause for results nobody picked.

    Emits `web` results, the same shape as the other web backends.
    """

    name = "web"

    def __init__(self, free_first: bool = False):
        self.free_first = free_first

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        exa = ("Exa", lambda: self._exa(query, limit))
        tinyfish = ("TinyFish", lambda: self._tinyfish(query, limit, hl))
        (first_name, first), (_, second) = (tinyfish, exa) if self.free_first else (exa, tinyfish)
        try:
            return first()
        except Exception as exc:  # noqa: BLE001 — any failure → the other backend
            logger.warning("%s search failed, trying the other backend: %s", first_name, exc)
        try:
            return second()
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Web search failed: {exc}") from exc

    def _exa(self, query: str, limit: int) -> list[SearchResult]:
        response = gateway.call(
            EXA,
            body={
                "query": query,
                "numResults": min(limit, 10),  # past 10, Exa bills per extra result
                "type": "auto",
                "contents": {"highlights": True},
            },
            timeout=_TIMEOUT_S,
        )
        if response.status != 200:
            raise RuntimeError(f"Exa HTTP {response.status}")
        if not response.cached:
            capture_paid_call("exa", "web_search", settings.exa_price_per_call)
        rows = (response.data or {}).get("results") or []
        return [r for r in (exa_result(row) for row in rows[:limit]) if r is not None]

    def _tinyfish(self, query: str, limit: int, hl: str | None) -> list[SearchResult]:
        params = {"query": query, "domain_type": "web", "purpose": _PURPOSE}
        if hl:
            params["language"] = hl.split("-")[0]
        response = gateway.call(TINYFISH, params=params, timeout=_TIMEOUT_S)
        if response.status != 200:
            raise RuntimeError(f"TinyFish HTTP {response.status}")
        rows = (response.data or {}).get("results") or []
        return [r for r in (tinyfish_result(row) for row in rows[:limit]) if r is not None]


def exa_result(row: dict) -> SearchResult | None:
    url = row.get("url")
    if not url:
        return None
    highlights = row.get("highlights") or []
    snippet = " … ".join(h.strip() for h in highlights if h and h.strip())[:_SNIPPET_CHARS]
    return web_result(url, row.get("title"), snippet, row.get("publishedDate"))


def tinyfish_result(row: dict) -> SearchResult | None:
    url = row.get("url")
    if not url:
        return None
    return web_result(url, row.get("title"), (row.get("snippet") or "").strip(), row.get("date"))
