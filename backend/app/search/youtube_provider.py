import logging

from yt_dlp import YoutubeDL
from yt_dlp.utils import YoutubeDLError

from app.core.config import settings
from app.search.models import SearchResult

logger = logging.getLogger(__name__)


class YouTubeProvider:
    """YouTube search via yt-dlp's `ytsearch`.

    Why yt-dlp and not the Data API v3: it needs no API key and no daily quota,
    and it reuses the exact client the rest of the app already relies on for
    metadata/subtitles. The trade-off is that `ytsearch` only returns *videos* —
    not typed playlist/channel results (that would require the Data API). The
    normalized schema still models every type, so a future Data-API provider can
    emit playlist/channel cards without touching the frontend; and pasted
    playlist/channel URLs are handled by the existing discovery expansion.
    """

    name = "youtube"

    def search(self, query: str, limit: int) -> list[SearchResult]:
        opts = {
            "extract_flat": True,  # metadata only, no per-video network calls
            "quiet": True,
            "no_warnings": True,
            # Same original-language request the rest of the app uses, so search
            # titles match the language of the eventual transcript/book.
            "extractor_args": {"youtube": {"lang": settings.preferred_languages}},
        }
        with YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            except YoutubeDLError as exc:
                # Let the service layer record this as a per-provider error.
                raise RuntimeError(f"YouTube search failed: {exc}") from exc

        entries = (info or {}).get("entries") or []
        return [self._to_result(e) for e in entries if e and e.get("id")]

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
