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


# Path segments that mark a page as a listing, taxonomy, shop, forum or account
# page rather than a readable article — the noise DuckDuckGo mixes into results.
# Matched against WHOLE path segments (never substrings), so an article whose
# slug merely contains one of these words ("/10-best-products") is never dropped.
_NON_ARTICLE_SEGMENTS = frozenset(
    {
        # shopping
        "shop", "store", "product", "products", "cart", "checkout", "basket",
        "collection", "collections", "pricing", "buy", "order", "orders",
        # listings / taxonomy / navigation
        "category", "categories", "tag", "tags", "author", "wishlist",
        # forums / discussion
        "forum", "forums", "viewtopic", "showthread", "thread", "threads",
        "comments",
        # account / utility
        "login", "signin", "signup", "register", "account", "search",
        "contact", "privacy", "terms",
    }
)

# Query keys that mark a URL as an on-site search or paginated listing, not an
# article (`?s=` is WordPress search, `?q=`/`?query=` generic search).
_LISTING_QUERY_KEYS = frozenset({"q", "s", "search", "query"})

# Most results one domain may contribute, so a single strong site can't flood a
# topic search. Applied after the home/deep collapse (see `_dedupe_domains`).
_MAX_PER_DOMAIN = 3


# Language segments a site uses to namespace a localized mirror of the *same*
# page (`/fr`, `/en-us`). A curated ISO 639-1 set, not a regex, so a real slug
# that merely looks like a code (rare) isn't mistaken for a locale.
_LOCALE_CODES = frozenset(
    {
        "en", "fr", "de", "es", "it", "pt", "nl", "ru", "ja", "zh", "ar", "ko",
        "pl", "tr", "sv", "da", "no", "fi", "cs", "el", "he", "hi", "id", "th",
        "vi", "uk", "ro", "hu", "ca", "fa",
    }
)


def _is_locale_segment(segment: str) -> bool:
    """True for a path segment that is a language tag (`fr`, `en-us`, `pt-br`)."""
    parts = segment.lower().split("-")
    return len(parts) <= 2 and parts[0] in _LOCALE_CODES


def _host(url: str) -> str:
    """The result's host, normalized: lowercased, `www.`-stripped, port-stripped."""
    return (urlparse(url).netloc or "").lower().removeprefix("www.").split(":")[0]


def _canonical_key(url: str) -> str:
    """A dedup key that folds the *same source* reached via different URLs.

    DuckDuckGo routinely returns a site's home and its localized mirror as two
    separate hits — `tokenbrice.xyz` and `tokenbrice.xyz/fr` — but that's one
    blog, one feed once discovery expands it, so two cards for it is noise. The
    key therefore drops the scheme, `www.`, query string and fragment (tracking
    params and `?lang=` switches don't make a new source) and strips a *leading*
    language segment from the path, so a localized home folds onto the bare home
    (`/fr` -> `/`) and `/fr/post` folds onto `/post`. Distinct articles keep
    distinct paths, so they're never collapsed. First (best-ranked) hit wins.
    """
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower().removeprefix("www.").split(":")[0]
    segments = [s for s in parsed.path.split("/") if s]
    if segments and _is_locale_segment(segments[0]):
        segments = segments[1:]
    return f"{host}/{'/'.join(segments)}"


def _is_article_like(url: str) -> bool:
    """Drop hits that are never a usable article source.

    Two cheap, no-fetch rules, in order:
    - Host: not a known non-article platform (social, short-form video,
      shopping, audio — see `_NON_ARTICLE_HOSTS`), which is noise for an article
      compiler or already covered by another provider.
    - URL shape: no path segment marks a listing / taxonomy / shop / forum /
      account page (`_NON_ARTICLE_SEGMENTS`), and no query param marks an on-site
      search or listing (`_LISTING_QUERY_KEYS`). Matched on WHOLE path segments,
      never substrings, so an article slug that merely contains one of these
      words ("/10-best-products-2026") is kept.

    Bare homepages are deliberately kept here — a blog's home
    (`https://tokenbrice.xyz/`) is a valid source discovery expands via RSS.
    Whether a home is redundant is decided later by the home-vs-deep collapse in
    `_dedupe_domains`, not by this filter, so a brand query never loses its one
    relevant result.
    """
    parsed = urlparse(url)
    host = _host(url)
    if any(host == d or host.endswith(f".{d}") for d in _NON_ARTICLE_HOSTS):
        return False
    segments = [s.lower() for s in parsed.path.split("/") if s]
    if any(seg in _NON_ARTICLE_SEGMENTS for seg in segments):
        return False
    if {k.lower() for k in parse_qs(parsed.query)} & _LISTING_QUERY_KEYS:
        return False
    return True


def _is_home(url: str) -> bool:
    """True for a site's bare home — an empty path after any leading locale.

    `https://site.com/`, `/fr`, `/en-us/` are all the home; `/post` is not.
    """
    segments = [s for s in urlparse(url).path.split("/") if s]
    if segments and _is_locale_segment(segments[0]):
        segments = segments[1:]
    return not segments


def _dedupe_domains(results: list[SearchResult]) -> list[SearchResult]:
    """Collapse same-site noise while keeping genuinely distinct articles.

    DuckDuckGo routinely returns a site's bare home AND a deep article from it as
    two separate hits. The deep article is the useful one, so when a host has any
    deeper result its bare home is dropped; a home with no deeper sibling is kept
    (it's a valid source discovery expands via RSS). A soft per-host cap then
    stops one strong domain from flooding the list on a topic search. Input order
    (DuckDuckGo's ranking) is preserved, so the best-ranked survivors stay first.

    Two genuinely distinct articles from the same domain are never collapsed —
    only the redundant home is, and only the flood beyond the cap is trimmed.
    """
    hosts_with_deep = {_host(r.url) for r in results if not _is_home(r.url)}
    kept: list[SearchResult] = []
    per_host: dict[str, int] = {}
    for r in results:
        host = _host(r.url)
        if _is_home(r.url) and host in hosts_with_deep:
            continue  # redundant home: a deeper article from the same site wins
        if per_host.get(host, 0) >= _MAX_PER_DOMAIN:
            continue  # soft anti-flood cap
        per_host[host] = per_host.get(host, 0) + 1
        kept.append(r)
    return kept


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

    def search(self, query: str, limit: int) -> list[SearchResult]:
        try:
            response = httpx.post(
                _ENDPOINT,
                data={"q": query},
                # Deliberately NO Accept-Language: forcing one (e.g. en-US) biases
                # DuckDuckGo toward that language's mirror of a site, which both
                # buries non-English sources and produces locale-variant dupes
                # (tokenbrice.xyz vs /fr). Without it DDG infers language from the
                # query itself, keeping results faithful to what's being searched.
                headers={"User-Agent": _BROWSER_UA},
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
            if not url:
                continue
            key = _canonical_key(url)
            if key in seen:
                continue
            if not _is_article_like(url):
                continue
            seen.add(key)

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

        # Collapse same-site home/deep noise and cap per domain AFTER collecting
        # every candidate, then truncate — so dropping a redundant home never
        # leaves the list short of `limit` when more good hits sit below it.
        return _dedupe_domains(results)[:limit]

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
