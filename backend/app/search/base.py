from typing import Protocol, runtime_checkable

from app.search.models import SearchResult


@runtime_checkable
class Provider(Protocol):
    """A search backend. Adding a source kind (podcasts, web…) is one new class
    implementing this and one line in the registry — nothing else changes.

    `search` is synchronous and may block (yt-dlp, HTTP): the service layer runs
    each provider in a thread with a timeout, so implementations stay simple and
    don't need to be async-aware.
    """

    # Stable identifier, also used as the ProviderError.provider value.
    name: str

    def search(self, query: str, limit: int) -> list[SearchResult]: ...
