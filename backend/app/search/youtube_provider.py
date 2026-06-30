import concurrent.futures
import logging

import httpx
from yt_dlp import YoutubeDL
from yt_dlp.utils import YoutubeDLError

from app.core.config import settings
from app.search.models import SearchResult

logger = logging.getLogger(__name__)

# YouTube's keyless oEmbed endpoint returns a video's TRUE ORIGINAL title — the
# creator's own, never auto-translated (it takes no language parameter). yt-dlp's
# flat search, by contrast, localizes titles to `hl`, which misrepresents the
# content (a French video shown as "Chicken with Onions"). So we overwrite each
# flat title with the oEmbed one. It's a tiny JSON GET (~0.1s), so resolving a
# page of results in parallel costs a fraction of a second.
_OEMBED_URL = "https://www.youtube.com/oembed"
_OEMBED_TIMEOUT_S = 5.0
_OEMBED_WORKERS = 8

# Original titles never change, so cache them for the life of the process. This
# collapses the repeated lookups search-as-you-type would otherwise make as the
# same videos resurface across query prefixes. Bounded so it can't grow forever.
_title_cache: dict[str, str] = {}
_TITLE_CACHE_MAX = 2000


class YouTubeProvider:
    """YouTube search via yt-dlp's `ytsearch`.

    Why yt-dlp and not the Data API v3: it needs no API key and no daily quota,
    and it reuses the exact client the rest of the app already relies on for
    metadata/subtitles. The trade-off is that `ytsearch` only returns *videos* —
    not typed playlist/channel results (that would require the Data API). The
    normalized schema still models every type, so a future Data-API provider can
    emit playlist/channel cards without touching the frontend; and pasted
    playlist/channel URLs are handled by the existing discovery expansion.

    Result titles are corrected to the video's ORIGINAL via oEmbed (see
    `_apply_original_titles`), so the list never shows an auto-translated title
    that misrepresents the content.
    """

    name = "youtube"

    def search(self, query: str, limit: int, hl: str | None = None) -> list[SearchResult]:
        # `hl` only sets the FALLBACK title language (the caller's browser
        # language) for the rare result oEmbed can't resolve; the authoritative
        # title is the oEmbed original applied below.
        lang = [hl] if hl else settings.preferred_languages
        opts = {
            "extract_flat": True,  # metadata only, no per-video network calls
            "quiet": True,
            "no_warnings": True,
            "extractor_args": {"youtube": {"lang": lang}},
        }
        with YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            except YoutubeDLError as exc:
                # Let the service layer record this as a per-provider error.
                raise RuntimeError(f"YouTube search failed: {exc}") from exc

        entries = (info or {}).get("entries") or []
        results = [self._to_result(e) for e in entries if e and e.get("id")]
        self._apply_original_titles(results)
        return results

    def _apply_original_titles(self, results: list[SearchResult]) -> None:
        """Overwrite each result's flat (auto-translatable) title with the video's
        TRUE ORIGINAL from oEmbed. Cached by id; a lookup that fails leaves the
        flat title in place, so search degrades gracefully rather than breaking."""
        pending = [r for r in results if r.id not in _title_cache]
        if pending:
            with concurrent.futures.ThreadPoolExecutor(max_workers=_OEMBED_WORKERS) as ex:
                titles = ex.map(lambda r: self._oembed_title(r.url), pending)
                for result, title in zip(pending, titles):
                    if title:
                        if len(_title_cache) >= _TITLE_CACHE_MAX:
                            _title_cache.pop(next(iter(_title_cache)))
                        _title_cache[result.id] = title
        for result in results:
            original = _title_cache.get(result.id)
            if original:
                result.title = original

    @staticmethod
    def _oembed_title(watch_url: str) -> str | None:
        try:
            resp = httpx.get(
                _OEMBED_URL,
                params={"url": watch_url, "format": "json"},
                timeout=_OEMBED_TIMEOUT_S,
            )
            if resp.status_code != 200:  # private/age-restricted/removed → no oEmbed
                return None
            return resp.json().get("title") or None
        except (httpx.HTTPError, ValueError):
            return None

    def _to_result(self, entry: dict) -> SearchResult:
        vid = entry.get("id", "")
        channel_url = entry.get("channel_url") or entry.get("uploader_url")
        return SearchResult(
            id=f"youtube:{vid}",
            type="video",
            title=entry.get("title") or "Untitled",
            # Canonicalize to a watch URL: discovery.detect_kind keys off this
            # shape, and flat entries sometimes carry only the bare id.
            url=f"https://www.youtube.com/watch?v={vid}",
            thumbnail=self._thumbnail(entry, vid),
            duration_s=int(entry["duration"]) if entry.get("duration") else None,
            author=entry.get("channel") or entry.get("uploader"),
            source="youtube",
            meta={
                "channel_url": channel_url,
                "view_count": entry.get("view_count"),
            },
        )

    @staticmethod
    def _thumbnail(entry: dict, vid: str) -> str | None:
        thumbs = entry.get("thumbnails") or []
        if thumbs:
            # yt-dlp orders thumbnails worst→best, so the last is the largest.
            last = thumbs[-1]
            if isinstance(last, dict) and last.get("url"):
                return last["url"]
        # Flat entries often omit thumbnails; the i.ytimg URL is derivable from
        # the id and lives outside the IP-blocked subtitle endpoints.
        return f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else None
