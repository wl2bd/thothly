from urllib.parse import parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup

from app.search.models import SearchResult
from app.search.web import web_result

# DuckDuckGo's no-JS HTML endpoint. Like yt-dlp for YouTube, it needs no API
# key, no registration and no quota — we POST a query and parse the rendered
# results page. The trade-off versus an official Search API is fragility: if
# DuckDuckGo changes its markup this provider degrades to "no results" and is
# isolated by the service layer, never blanking the other providers.
_ENDPOINT = "https://html.duckduckgo.com/html/"

# A browser-like User-Agent: the endpoint serves an empty page to obvious bots.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_TIMEOUT_S = 10.0

class WebProvider:
    """General web search via DuckDuckGo's keyless HTML endpoint.

    DEPRECATED fallback (web_search_backend="ddg"): DuckDuckGo rate-limits this
    HTML endpoint hard — it serves an anti-bot page (HTTP 202) after a couple of
    queries from one IP, and worse from a server IP — so it isn't viable as the
    default. The default web backend is Marginalia (see marginalia_provider.py);
    this is kept only as a last resort.

    Emits `web` results: a picked one is just an article URL, which the existing
    discovery flow already handles (detect_kind -> "blog" -> text extraction), so
    web search works end to end without any new pipeline code.
    """

    name = "web"

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        try:
            response = httpx.post(
                _ENDPOINT,
                data={"q": query},
                # Deliberately NO Accept-Language: forcing one (e.g. en-US) biases
                # DuckDuckGo toward that language's mirror of a site, which both
                # buries non-English sources and produces locale-variant dupes
                # (quillnotes.example vs /fr). Without it DDG infers language from the
                # query itself, keeping results faithful to what's being searched.
                headers={"User-Agent": _BROWSER_UA},
                timeout=_TIMEOUT_S,
                follow_redirects=True,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Web search failed: {exc}") from exc

        return self._parse(response.text, limit)

    def _parse(self, html: str, limit: int) -> list[SearchResult]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[SearchResult] = []

        for node in soup.select("div.result"):
            # Sponsored hits carry a `result--ad` modifier — skip them.
            classes = node.get("class") or []
            if any("result--ad" in c for c in classes):
                continue

            link = node.select_one("a.result__a")
            if not link or not link.get("href"):
                continue
            url = self._real_url(link["href"])
            if not url:
                continue
            snippet_node = node.select_one(".result__snippet")
            snippet = snippet_node.get_text(" ", strip=True) if snippet_node else None
            results.append(web_result(url, link.get_text(" ", strip=True), snippet))
        return results[:limit]

    @staticmethod
    def _real_url(href: str) -> str | None:
        """Resolve DuckDuckGo's redirect links to the destination URL.

        Result links look like `//duckduckgo.com/l/?uddg=<encoded-target>&…`;
        the real URL is the `uddg` query param. Direct links are returned as-is.
        """
        if "duckduckgo.com/l/" in href:
            query = urlparse(href).query
            target = parse_qs(query).get("uddg", [None])[0]
            return target
        if href.startswith("//"):
            href = f"https:{href}"
        return href if href.startswith("http") else None
