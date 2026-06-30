import asyncio
import logging
import re
import time
from urllib.parse import urlparse

from app.core.config import settings
from app.search.base import Provider
from app.search.brave_provider import BraveProvider
from app.search.marginalia_provider import MarginaliaProvider
from app.search.models import ProviderError, SearchResponse, SearchResult
from app.search.podcast_provider import PodcastProvider
from app.search.web_provider import WebProvider
from app.search.youtube_provider import YouTubeProvider

logger = logging.getLogger(__name__)


class _CachedWebProvider:
    """Wraps the web backend with a short TTL cache and a min-length skip.

    The home bar fires a search per keystroke, so without this every prefix of a
    query ("o", "op", "ope"…) and every re-search hits the backend. yt-dlp and
    iTunes shrug it off, but a web engine doesn't: Marginalia's shared key throttles
    and Brave's calls are metered. The cache collapses exact repeats (re-search,
    delete-and-retype, back navigation) within the TTL, and the min length skips
    the noisy first keystrokes that can't make a useful query anyway. Failures are
    NOT cached — a timed-out call is retried next time and still surfaces as an
    error, never a fake empty result.
    """

    name = "web"
    _MIN_QUERY_LEN = 3
    _TTL_S = 300.0
    _MAX_ENTRIES = 256

    def __init__(self, inner: Provider):
        self._inner = inner
        self._cache: dict[str, tuple[float, list[SearchResult]]] = {}

    def search(self, query: str, limit: int) -> list[SearchResult]:
        q = query.strip()
        if len(q) < self._MIN_QUERY_LEN:
            return []
        key = f"{q.lower()}::{limit}"
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached is not None and now - cached[0] < self._TTL_S:
            return cached[1]
        results = self._inner.search(query, limit)
        # Don't cache an empty result: a backend that's momentarily throttled can
        # answer 200 with no hits, and caching that would wrongly blank the query
        # for the whole TTL even after it recovers. Only real hits are memoized.
        if results:
            self._cache[key] = (now, results)
            if len(self._cache) > self._MAX_ENTRIES:
                oldest = min(self._cache, key=lambda k: self._cache[k][0])
                del self._cache[oldest]
        return results


def _build_web_provider() -> Provider:
    """Pick the web-article backend from config (see Settings.web_search_backend),
    wrapped in a per-keystroke cache (see `_CachedWebProvider`).

    All backends emit `web` results, so the rest of the app is backend-agnostic.
    Selecting "brave" without a key falls back to Marginalia rather than silently
    returning nothing, and an unknown value falls back too.
    """
    backend = (settings.web_search_backend or "marginalia").strip().lower()
    if backend == "brave":
        if settings.brave_api_key:
            return _CachedWebProvider(BraveProvider())
        logger.warning(
            "web_search_backend=brave but BRAVE_API_KEY is unset — "
            "falling back to Marginalia."
        )
        return _CachedWebProvider(MarginaliaProvider())
    if backend == "ddg":
        return _CachedWebProvider(WebProvider())
    if backend != "marginalia":
        logger.warning("Unknown web_search_backend=%r — using Marginalia.", backend)
    return _CachedWebProvider(MarginaliaProvider())


# The provider registry. Adding a source kind = add one class here; the service,
# endpoint, and frontend stay untouched. The web slot is pluggable (see
# `_build_web_provider`); YouTube and podcasts have a single backend each.
PROVIDERS: list[Provider] = [YouTubeProvider(), _build_web_provider(), PodcastProvider()]

# Per-provider wall-clock budget: a slow or hung provider must never hold up the
# results the others already produced, so each is capped independently.
_PROVIDER_TIMEOUT_S = 12
_DEFAULT_LIMIT = 12


async def search_all(query: str, limit: int = _DEFAULT_LIMIT) -> SearchResponse:
    """Query every provider in parallel and merge into one unified list.

    Each provider's `search` is sync and blocking, so it runs in a worker thread
    under its own timeout. A provider that raises or times out is recorded in
    `errors` and contributes no results; the providers that succeeded are
    returned regardless, so one provider being down never blanks the search.
    """
    loop = asyncio.get_running_loop()

    async def run(provider: Provider) -> tuple[str, list[SearchResult], str | None]:
        try:
            results = await asyncio.wait_for(
                loop.run_in_executor(None, provider.search, query, limit),
                _PROVIDER_TIMEOUT_S,
            )
            return provider.name, results, None
        except asyncio.TimeoutError:
            logger.warning("Search provider %s timed out", provider.name)
            return provider.name, [], "timed out"
        except Exception as exc:  # noqa: BLE001 — isolate one provider's failure
            logger.warning("Search provider %s failed: %s", provider.name, exc)
            return provider.name, [], str(exc)

    outcomes = await asyncio.gather(*(run(p) for p in PROVIDERS))

    # Flatten into (provider_index, within-provider rank, result). The two
    # indices are kept so ranking can fall back to a fair round-robin when no
    # textual signal separates results (see `_rank`).
    ranked_inputs: list[tuple[int, int, SearchResult]] = []
    errors: list[ProviderError] = []
    for provider_index, (name, provider_results, error) in enumerate(outcomes):
        for rank, result in enumerate(provider_results):
            ranked_inputs.append((provider_index, rank, result))
        if error is not None:
            errors.append(ProviderError(provider=name, message=error))

    return SearchResponse(results=_rank(ranked_inputs, query), errors=errors)


def _rank(
    items: list[tuple[int, int, SearchResult]], query: str
) -> list[SearchResult]:
    """Order results across providers by a cheap query-relevance score.

    Providers each return their own hits already sorted by relevance, but those
    scores aren't comparable across providers, so we can't just concatenate (it
    buries every provider but the first) nor blindly round-robin (it puts the #1
    YouTube hit ahead of an exact-match blog). Instead we compute one
    cross-provider score per result from the query text and sort by:

      1. relevance score, descending — a brand/domain or title match wins
         regardless of which provider produced it;
      2. within-provider rank, ascending — ties degrade to a round-robin
         (every provider's #1, then every provider's #2, …);
      3. provider index — a stable, deterministic final tiebreak.

    The result: a query like "tokenbrice" surfaces the tokenbrice.xyz blog
    first, while a generic query keeps the fair round-robin behaviour.
    """
    q_norm = query.strip().lower()
    q_tokens = re.findall(r"\w+", q_norm)
    q_compact = re.sub(r"\W+", "", q_norm)

    ordered = sorted(
        items,
        key=lambda it: (-_relevance(it[2], q_compact, q_tokens), it[1], it[0]),
    )
    return [result for _, _, result in ordered]


def _relevance(result: SearchResult, q_compact: str, q_tokens: list[str]) -> int:
    """Score one result against the query. Higher = more relevant.

    Deliberately simple and provider-agnostic — it only reads fields every
    result has (url, title, author) and rewards, in decreasing weight:
      * an exact brand/domain match (query == the site's domain label, so
        "tokenbrice" == tokenbrice.xyz) — the strongest "this *is* the source"
        signal;
      * query tokens appearing in the title (with a bonus for matching all);
      * the query appearing in the author/site name.
    """
    if not q_tokens:
        return 0

    score = 0

    host = (urlparse(result.url).netloc or "").lower().removeprefix("www.").split(":")[0]
    labels = host.split(".")
    domain_label = labels[-2] if len(labels) >= 2 else (labels[0] if labels else "")
    if q_compact and domain_label and q_compact == domain_label:
        score += 100

    title = result.title.lower()
    title_hits = sum(1 for token in q_tokens if token in title)
    score += title_hits * 5
    if title_hits == len(q_tokens):
        score += 20

    author = (result.author or "").lower()
    if q_compact and q_compact in re.sub(r"\W+", "", author):
        score += 10

    return score
