import logging
from urllib.parse import parse_qs, urlparse

import httpx
from bs4 import BeautifulSoup

from app.search.models import SearchResult

logger = logging.getLogger(__name__)

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

# Hosts a web hit should never come from: either already covered by another
# provider (YouTube) or simply not a readable article (social, short-form video,
# shopping, audio). Thothly compiles *articles*, so these are noise — dropping
# them is the cheapest, highest-signal relevance win for the web provider.
# Matched against the registrable host and any of its subdomains.
_NON_ARTICLE_HOSTS = frozenset(
    {
        "youtube.com",
        "youtu.be",
        "twitter.com",
        "x.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com",
        "pinterest.com",
        "reddit.com",
        "linkedin.com",
        "amazon.com",
        "ebay.com",
        "spotify.com",
        "podcasts.apple.com",
        "apple.com",
    }
)


def _is_article_like(url: str) -> bool:
    """Drop hits from platforms that are never a usable article source.

    A single conservative rule: the host isn't a known non-article platform
    (social, short-form video, shopping, audio — see `_NON_ARTICLE_HOSTS`),
    which is noise for an article compiler or already covered by another
    provider. Everything else is kept, *including* bare homepages — a blog's
    homepage (`https://tokenbrice.xyz/`) is a perfectly good source that
    discovery expands into articles via RSS. Ordering is left to the relevance
    ranking in the service layer rather than a hard path filter that would drop
    the single most relevant result for a brand query.
    """
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower().removeprefix("www.").split(":")[0]
    return not any(host == d or host.endswith(f".{d}") for d in _NON_ARTICLE_HOSTS)


class WebProvider:
    """General web search via DuckDuckGo's keyless HTML endpoint.

    Emits `web` results: a picked one is just an article URL, which the existing
    discovery flow already handles (detect_kind -> "blog" -> text extraction), so
    web search works end to end without any new pipeline code.
    """

    name = "web"

    def search(self, query: str, limit: int) -> list[SearchResult]:
        try:
            response = httpx.post(
                _ENDPOINT,
                data={"q": query},
                headers={
                    "User-Agent": _BROWSER_UA,
                    "Accept-Language": "en-US,en;q=0.9",
                },
                timeout=_TIMEOUT_S,
                follow_redirects=True,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            # Surfaced by the service layer as a per-provider error.
            raise RuntimeError(f"Web search failed: {exc}") from exc

        return self._parse(response.text, limit)

    def _parse(self, html: str, limit: int) -> list[SearchResult]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[SearchResult] = []
        seen: set[str] = set()

        for node in soup.select("div.result"):
            # Sponsored hits carry a `result--ad` modifier — skip them.
            classes = node.get("class") or []
            if any("result--ad" in c for c in classes):
                continue

            link = node.select_one("a.result__a")
            if not link or not link.get("href"):
                continue
            url = self._real_url(link["href"])
            if not url or url in seen:
                continue
            if not _is_article_like(url):
                continue
            seen.add(url)

            title = link.get_text(" ", strip=True) or url
            snippet_node = node.select_one(".result__snippet")
            snippet = snippet_node.get_text(" ", strip=True) if snippet_node else None

            results.append(
                SearchResult(
                    id=f"web:{url}",
                    type="web",
                    title=title,
                    url=url,
                    author=urlparse(url).netloc or None,
                    source="web",
                    meta={"snippet": snippet} if snippet else {},
                )
            )
            if len(results) >= limit:
                break

        return results

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
