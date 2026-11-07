"""What every web backend's results go through, whichever engine found them."""

from urllib.parse import parse_qs, unquote, urlparse

from app.search.models import SearchResult

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
        # job boards and applicant-tracking systems: a job ad is never a read
        "indeed.com",
        "glassdoor.com",
        "monster.com",
        "ziprecruiter.com",
        "simplyhired.com",
        "careerbuilder.com",
        "greenhouse.io",
        "lever.co",
        "ashbyhq.com",
        "myworkdayjobs.com",
        "smartrecruiters.com",
        "workable.com",
        "francetravail.fr",
        "hellowork.com",
    }
)

# Subdomains a company keeps for its job ads (jobs.boeing.com, careers.acme.io).
_JOB_SUBDOMAINS = ("jobs.", "careers.", "career.", "emplois.", "recrutement.")


# Path segments that mark a page as a listing, taxonomy, shop, forum or account
# page rather than a readable article — the noise engines mix into results.
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
        # job ads, in the shapes job sites and careers pages use
        "job", "jobs", "career", "careers", "emplois", "offres-emploi",
        "stellenangebote", "vacancies", "openings",
    }
)

# File types a URL can end in that are a download, not a web page: documents,
# spreadsheets, slides, archives, ebooks, media, images. Thothly reads web pages,
# so a hit pointing at a file is dropped whatever the site. A blocklist of file
# types, not an allowlist of page types, so a slug that merely ends in a dot
# ("/why-i-moved-to-node.js", "/releases/v2.5") is still kept.
_FILE_EXTENSIONS = frozenset(
    {
        "pdf", "ps", "djvu", "doc", "docx", "odt", "rtf", "pages", "txt", "md",
        "xls", "xlsx", "ods", "csv", "numbers", "ppt", "pptx", "odp", "key",
        "zip", "rar", "7z", "gz", "tar", "tgz", "dmg", "exe", "msi", "apk",
        "epub", "mobi", "azw", "azw3",
        "mp3", "m4a", "wav", "ogg", "flac", "mp4", "m4v", "mov", "avi", "mkv", "webm",
        "png", "jpg", "jpeg", "gif", "webp", "svg", "tif", "tiff", "bmp", "heic",
        "xml", "json",
    }
)

# Query keys that mark a URL as an on-site search or paginated listing, not an
# article (`?s=` is WordPress search, `?q=`/`?query=` generic search).
_LISTING_QUERY_KEYS = frozenset({"q", "s", "search", "query"})

# Most results one domain may contribute, so a single strong site can't flood a
# topic search. Applied after the home/deep collapse (see `tidy`).
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


def is_locale_segment(segment: str) -> bool:
    """True for a path segment that is a language tag (`fr`, `en-us`, `pt-br`)."""
    parts = segment.lower().split("-")
    return len(parts) <= 2 and parts[0] in _LOCALE_CODES


def host(url: str) -> str:
    """The result's host, normalized: lowercased, `www.`-stripped, port-stripped."""
    return (urlparse(url).netloc or "").lower().removeprefix("www.").split(":")[0]


def canonical_key(url: str) -> str:
    """A dedup key that folds the *same source* reached via different URLs.

    Engines routinely return a site's home and its localized mirror as two
    separate hits — `quillnotes.example` and `quillnotes.example/fr` — but that's one
    blog, one feed once discovery expands it, so two cards for it is noise. The
    key therefore drops the scheme, `www.`, query string and fragment (tracking
    params and `?lang=` switches don't make a new source) and strips a *leading*
    language segment from the path, so a localized home folds onto the bare home
    (`/fr` -> `/`) and `/fr/post` folds onto `/post`. Distinct articles keep
    distinct paths, so they're never collapsed. First (best-ranked) hit wins.
    """
    segments = [s for s in urlparse(url).path.split("/") if s]
    if segments and is_locale_segment(segments[0]):
        segments = segments[1:]
    return f"{host(url)}/{'/'.join(segments)}"


def is_article_like(url: str) -> bool:
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
    (`https://quillnotes.example/`) is a valid source discovery expands via RSS.
    Whether a home is redundant is decided later by the home-vs-deep collapse in
    `tidy`, not by this filter, so a brand query never loses its one
    relevant result.
    """
    parsed = urlparse(url)
    site = host(url)
    if any(site == d or site.endswith(f".{d}") for d in _NON_ARTICLE_HOSTS):
        return False
    if site.startswith(_JOB_SUBDOMAINS):
        return False
    segments = [s.lower() for s in parsed.path.split("/") if s]
    if any(seg in _NON_ARTICLE_SEGMENTS for seg in segments):
        return False
    if segments and _extension(segments[-1]) in _FILE_EXTENSIONS:
        return False
    if {k.lower() for k in parse_qs(parsed.query)} & _LISTING_QUERY_KEYS:
        return False
    return True


def _extension(segment: str) -> str:
    """The file extension of a path segment, lowercased (`X.Pdf` -> `pdf`), or ""."""
    name = unquote(segment)
    return name.rsplit(".", 1)[1].lower() if "." in name else ""


def is_home(url: str) -> bool:
    """True for a site's bare home — an empty path after any leading locale.

    `https://site.com/`, `/fr`, `/en-us/` are all the home; `/post` is not.
    """
    segments = [s for s in urlparse(url).path.split("/") if s]
    if segments and is_locale_segment(segments[0]):
        segments = segments[1:]
    return not segments


def _collapse(results: list[SearchResult]) -> list[SearchResult]:
    """Collapse same-site noise while keeping genuinely distinct articles.

    Engines routinely return a site's bare home AND a deep article from it as
    two separate hits. The deep article is the useful one, so when a host has any
    deeper result its bare home is dropped; a home with no deeper sibling is kept
    (it's a valid source discovery expands via RSS). A soft per-host cap then
    stops one strong domain from flooding the list on a topic search. Input order
    (the engine's ranking) is preserved, so the best-ranked survivors stay first.

    Two genuinely distinct articles from the same domain are never collapsed —
    only the redundant home is, and only the flood beyond the cap is trimmed.
    """
    hosts_with_deep = {host(r.url) for r in results if not is_home(r.url)}
    kept: list[SearchResult] = []
    per_host: dict[str, int] = {}
    for r in results:
        site = host(r.url)
        if is_home(r.url) and site in hosts_with_deep:
            continue  # redundant home: a deeper article from the same site wins
        if per_host.get(site, 0) >= _MAX_PER_DOMAIN:
            continue  # soft anti-flood cap
        per_host[site] = per_host.get(site, 0) + 1
        kept.append(r)
    return kept


def tidy(results: list[SearchResult]) -> list[SearchResult]:
    """Keep article-like hits, one per source reached via different URLs, and
    collapse same-site noise, in the engine's rank order."""
    seen: set[str] = set()
    kept: list[SearchResult] = []
    for r in results:
        key = canonical_key(r.url)
        if key not in seen and is_article_like(r.url):
            seen.add(key)
            kept.append(r)
    return _collapse(kept)


def web_result(
    url: str, title: str | None, snippet: str | None = None, published_at: str | None = None
) -> SearchResult:
    # No author: the site is the identity, and the URL already carries it
    # (shown as favicon + domain).
    return SearchResult(
        id=f"web:{url}",
        type="web",
        title=(title or "").strip() or url,
        url=url,
        source="web",
        # published_at (ISO) feeds the triage's freshness criterion.
        meta={k: v for k, v in (("snippet", snippet), ("published_at", published_at)) if v},
    )
