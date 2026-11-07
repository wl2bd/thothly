import re

import httpx

from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.search.models import SearchResult
from app.search.web import web_result

_TIMEOUT_S = 10.0

# Brave highlights query terms in titles/snippets with <strong> tags; strip any
# markup so the text renders plainly wherever it lands.
_TAG_RE = re.compile(r"<[^>]+>")


class BraveProvider:
    """Web-article search via the Brave Search API.

    A general-web index — broader than Marginalia's small-web focus — that's
    commercial-friendly, so it's the path for a hosted/paid deployment. Needs an
    API key (BRAVE_API_KEY); the service falls back to Marginalia when it's
    unset, so selecting this backend without a key never silently breaks search.

    Emits `web` results, the same shape as the other web backends, so nothing
    downstream changes when a self-hoster switches to it.
    """

    name = "web"

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        try:
            response = httpx.get(
                settings.brave_base_url,
                params={"q": query, "count": limit},
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": settings.brave_api_key or "",
                },
                timeout=_TIMEOUT_S,
            )
            response.raise_for_status()
            capture_paid_call("brave", "web_search", settings.brave_price_per_call)
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError(f"Web search failed: {exc}") from exc

        web = (payload.get("web") or {}).get("results") or []
        return [
            web_result(
                e["url"], _strip_tags(e.get("title")), _strip_tags(e.get("description")),
                e.get("page_age"),
            )
            for e in web[:limit]
            if e.get("url")
        ]


def _strip_tags(text: str | None) -> str:
    return _TAG_RE.sub("", text).strip() if text else ""
