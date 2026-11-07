from typing import Protocol

from app.search.models import SearchResult


class Provider(Protocol):
    """A search backend.

    `search` is synchronous and may block (yt-dlp, HTTP): the service layer runs
    each provider in a thread with a timeout, so implementations stay simple and
    don't need to be async-aware.
    """

    # Stable identifier, sent as ProviderBatch.provider.
    name: str

    # `hl` is an optional locale hint (a base language code like "fr"), taken from
    # the caller's Accept-Language — the YouTube provider uses it to localize
    # result titles the way an anonymous browser visit would; providers it doesn't
    # apply to simply ignore it.
    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]: ...
