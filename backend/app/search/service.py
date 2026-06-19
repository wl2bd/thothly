import asyncio
import logging

from app.search.base import Provider
from app.search.models import ProviderError, SearchResponse, SearchResult
from app.search.web_provider import WebProvider
from app.search.youtube_provider import YouTubeProvider

logger = logging.getLogger(__name__)

# The provider registry. Adding a source kind = add one class here; the service,
# endpoint, and frontend stay untouched.
PROVIDERS: list[Provider] = [YouTubeProvider(), WebProvider()]

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

    results: list[SearchResult] = []
    errors: list[ProviderError] = []
    for name, provider_results, error in outcomes:
        results.extend(provider_results)
        if error is not None:
            errors.append(ProviderError(provider=name, message=error))
    return SearchResponse(results=results, errors=errors)
