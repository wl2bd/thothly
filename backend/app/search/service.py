import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging
import re
import time
from collections import Counter
from collections.abc import AsyncIterator

from app.core import gateway
from app.core.config import settings
from app.core.posthog import capture
from app.search.base import Provider
from app.search.brave_provider import BraveProvider
from app.search.exa_provider import EXA, ExaProvider
from app.search.marginalia_provider import MarginaliaProvider
from app.search.models import ProviderBatch, SearchResult
from app.search.podcast_provider import PodcastProvider
from app.search.triage import triage, triage_enabled
from app.search.web import host, tidy
from app.search.web_provider import WebProvider
from app.search.youtube_provider import YouTubeProvider, paid_search

logger = logging.getLogger(__name__)


class _CachedProvider:
    """Wraps a metered backend (web, paid YouTube) with a short TTL cache and a min-length skip.

    The home bar fires a search per keystroke, so without this every prefix of a
    query ("o", "op", "ope"…) and every re-search hits the backend. yt-dlp and
    iTunes shrug it off, but a web engine doesn't: Marginalia's shared key throttles
    and Brave's calls are metered. The cache collapses exact repeats (re-search,
    delete-and-retype, back navigation) within the TTL, and the min length skips
    the noisy first keystrokes that can't make a useful query anyway. Failures are
    NOT cached — a timed-out call is retried next time and still surfaces as an
    error, never a fake empty result.
    """

    _MIN_QUERY_LEN = 3
    _TTL_S = 300.0
    _MAX_ENTRIES = 256

    def __init__(self, inner: Provider):
        self._inner = inner
        self.name = inner.name
        self._cache: dict[str, tuple[float, list[SearchResult]]] = {}

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        q = query.strip()
        if len(q) < self._MIN_QUERY_LEN:
            return []
        # hl is not part of the key: it localizes YouTube titles, not web results.
        key = f"{q.lower()}::{limit}"
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached is not None and now - cached[0] < self._TTL_S:
            return cached[1]
        results = self._inner.search(query, limit, hl)
        # Don't cache an empty result: a backend that's momentarily throttled can
        # answer 200 with no hits, and caching that would wrongly blank the query
        # for the whole TTL even after it recovers. Only real hits are memoized.
        if results:
            self._cache[key] = (now, results)
            if len(self._cache) > self._MAX_ENTRIES:
                oldest = min(self._cache, key=lambda k: self._cache[k][0])
                del self._cache[oldest]
        return results


class _WebPolicy:
    """Every web backend's hits go through the same rules (app/search/web.py),
    so a YouTube channel or an Instagram profile never comes back as "Article",
    whichever engine found it."""

    def __init__(self, inner: Provider):
        self._inner = inner
        self.name = inner.name

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        return tidy(self._inner.search(query, limit, hl))


def _build_web_provider() -> Provider:
    """The configured web backend, behind the shared web rules and the
    per-keystroke cache."""
    return _CachedProvider(_WebPolicy(_pick_web_provider()))


def _pick_web_provider() -> Provider:
    """Pick the web-article backend from config (see Settings.web_search_backend).

    All backends emit `web` results, so the rest of the app is backend-agnostic.
    Selecting "brave" without a key falls back to Marginalia rather than silently
    returning nothing, and an unknown value falls back too.
    """
    backend = (settings.web_search_backend or "marginalia").strip().lower()
    if backend in ("exa", "tinyfish"):
        if gateway.available(EXA):
            return ExaProvider(free_first=backend == "tinyfish")
        logger.warning(
            "web_search_backend=%s but neither TREG_TOKEN nor MONID_API_KEY is set — "
            "falling back to Marginalia.", backend
        )
        return MarginaliaProvider()
    if backend == "brave":
        if settings.brave_api_key:
            return BraveProvider()
        logger.warning(
            "web_search_backend=brave but BRAVE_API_KEY is unset — "
            "falling back to Marginalia."
        )
        return MarginaliaProvider()
    if backend == "ddg":
        return WebProvider()
    if backend != "marginalia":
        logger.warning("Unknown web_search_backend=%r — using Marginalia.", backend)
    return MarginaliaProvider()


# The provider registry. Adding a source kind = add one class here; the service,
# endpoint, and frontend stay untouched. The web slot is pluggable (see
# `_build_web_provider`); YouTube and podcasts have a single backend each.
# YouTube is cached too when it's the paid ScrapeCreators search (see YouTubeProvider).
PROVIDERS: list[Provider] = [
    _CachedProvider(YouTubeProvider())
    if paid_search()
    else YouTubeProvider(),
    _build_web_provider(),
    PodcastProvider(),
]

# Per-provider wall-clock budget: a slow or hung provider must never hold up the
# results the others already produced, so each is capped independently.
_PROVIDER_TIMEOUT_S = 12
# The providers and the triage are blocking network calls run in threads. A
# thread can't be cancelled, so a search the user typed past keeps its threads
# busy until its calls return. The loop's default pool (cpu + 4 = 5 threads on a
# one-CPU Fly machine) would fill after two abandoned searches and queue the
# live one behind them, eating its timeout. Waiting on the network costs no CPU,
# so a dedicated, wider pool keeps the live search from queuing.
_EXECUTOR = ThreadPoolExecutor(max_workers=32, thread_name_prefix="search")
_DEFAULT_LIMIT = 12


async def _run(
    provider: Provider, query: str, limit: int, hl: str | None
) -> tuple[str, list[SearchResult], str | None]:
    """One provider's search in a worker thread under its own timeout.

    Never raises: a failure or timeout comes back as an error string with no
    results, so one provider being down never takes the others with it."""
    loop = asyncio.get_running_loop()
    try:
        results = await asyncio.wait_for(
            loop.run_in_executor(_EXECUTOR, provider.search, query, limit, hl),
            _PROVIDER_TIMEOUT_S,
        )
        return provider.name, results, None
    except asyncio.TimeoutError:
        logger.warning("Search provider %s timed out", provider.name)
        return provider.name, [], "timed out"
    except Exception as exc:  # noqa: BLE001 — isolate one provider's failure
        logger.warning("Search provider %s failed: %s", provider.name, exc)
        return provider.name, [], str(exc)


async def search_batches(
    query: str, limit: int = _DEFAULT_LIMIT, hl: str | None = None
) -> AsyncIterator[ProviderBatch]:
    """Search every provider, yielding each one's results the moment it finishes.

    Providers answer at very different speeds (podcasts well under a second, the
    paid YouTube search several seconds, the web up to its timeout), so waiting
    for all of them makes the fastest wait for the slowest. Each batch is ranked
    and triaged on its own: every judgment is per result, so splitting by
    provider costs nothing in quality, only one small triage call per provider
    instead of one per search (fractions of a thousandth of a cent). Ranking across
    providers is the caller's call; the UI appends batches so rows never move
    under the user.
    """
    loop = asyncio.get_running_loop()
    tasks = [asyncio.create_task(_run(p, query, limit, hl)) for p in PROVIDERS]
    found = 0
    shown: Counter[str] = Counter()
    failed: list[str] = []
    answered = 0
    try:
        for next_done in asyncio.as_completed(tasks):
            name, results, error = await next_done
            answered += 1
            found += len(results)
            results = _rank(results, query)
            if results and triage_enabled():
                results = await loop.run_in_executor(_EXECUTOR, triage, query, results)
            shown.update(r.type for r in results)
            if error is not None:
                failed.append(name)
            yield ProviderBatch(provider=name, results=results, error=error)
    finally:
        # The client aborts the stream on every new keystroke. Cancelling stops
        # waiting on the providers still out; their threads finish on their own
        # (see `_EXECUTOR`), and their paid calls are still billed.
        for task in tasks:
            task.cancel()
        # Sent for abandoned searches too: their paid calls are counted anyway,
        # so leaving them out would skew cost per search.
        capture(
            "search_completed",
            {
                "found_count": found,
                "shown_count": sum(shown.values()),
                "result_types": dict(shown),
                "failed_providers": failed,
                "triaged": triage_enabled(),
                "streamed": True,
                "aborted": answered < len(tasks),
            },
        )


def _rank(results: list[SearchResult], query: str) -> list[SearchResult]:
    """Order one provider's results by a cheap query-relevance score, keeping the
    provider's own order between equals. A query like "quillnotes" puts the
    quillnotes.example blog first; a generic one keeps the provider's ranking."""
    q_norm = query.strip().lower()
    q_tokens = re.findall(r"\w+", q_norm)
    q_compact = re.sub(r"\W+", "", q_norm)
    return sorted(results, key=lambda r: -_relevance(r, q_compact, q_tokens))


def _relevance(result: SearchResult, q_compact: str, q_tokens: list[str]) -> int:
    """Score one result against the query. Higher = more relevant.

    Deliberately simple and provider-agnostic — it only reads fields every
    result has (url, title, author) and rewards, in decreasing weight:
      * an exact brand/domain match (query == the site's domain label, so
        "quillnotes" == quillnotes.example) — the strongest "this *is* the source"
        signal;
      * query tokens appearing in the title (with a bonus for matching all);
      * the query appearing in the author/site name.
    """
    if not q_tokens:
        return 0

    score = 0

    labels = host(result.url).split(".")
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
