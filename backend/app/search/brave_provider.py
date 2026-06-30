import logging
import re

import httpx

from app.core.config import settings
from app.search.models import SearchResult

logger = logging.getLogger(__name__)

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

    def search(self, query: str, limit: int) -> list[SearchResult]:
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
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Surfaced by the service layer as a per-provider error.
            raise RuntimeError(f"Web search failed: {exc}") from exc

        web = (payload.get("web") or {}).get("results") or []
        results: list[SearchResult] = []
        for entry in web[:limit]:
            result = self._to_result(entry)
            if result is not None:
                results.append(result)
        return results

    def _to_result(self, entry: dict) -> SearchResult | None:
        url = entry.get("url")
        if not url:
            return None
        # No author: the site is the identity and the URL already carries it
        # (favicon + domain), so a separate field would just repeat the host.
        description = _strip_tags(entry.get("description"))
        return SearchResult(
            id=f"web:{url}",
            type="web",
            title=_strip_tags(entry.get("title")) or url,
            url=url,
            source="web",
            meta={"snippet": description} if description else {},
        )


def _strip_tags(text: str | None) -> str:
    return _TAG_RE.sub("", text).strip() if text else ""
