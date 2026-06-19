import logging

import httpx

from app.search.models import SearchResult

logger = logging.getLogger(__name__)

# Apple's iTunes Search API: keyless, no registration, no quota — the same
# spirit as the yt-dlp YouTube provider. We query episodes (not shows) so each
# result is a single pickable item whose `url` is the audio enclosure, ready for
# the transcription pipeline. A podcast is just an RSS feed; iTunes is only the
# (keyless) search index over it, and even hands back the original feedUrl.
_ENDPOINT = "https://itunes.apple.com/search"
_TIMEOUT_S = 10.0


class PodcastProvider:
    """Podcast-episode search via Apple's keyless iTunes Search API.

    Emits `episode` results whose `url` is the audio enclosure. Turning a picked
    episode into a chapter needs the speech-to-text layer (transcribe.py): with
    no STT endpoint configured the episode is skipped, like a video without
    subtitles. Many podcasts also mirror full episodes on YouTube, where the
    YouTube provider already covers them via subtitles at no transcription cost.
    """

    name = "podcast"

    def search(self, query: str, limit: int) -> list[SearchResult]:
        try:
            response = httpx.get(
                _ENDPOINT,
                params={
                    "term": query,
                    "media": "podcast",
                    "entity": "podcastEpisode",
                    "limit": limit,
                },
                timeout=_TIMEOUT_S,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            # Surfaced by the service layer as a per-provider error.
            raise RuntimeError(f"Podcast search failed: {exc}") from exc

        results: list[SearchResult] = []
        for entry in payload.get("results", []):
            result = self._to_result(entry)
            if result is not None:
                results.append(result)
        return results

    def _to_result(self, entry: dict) -> SearchResult | None:
        # No audio enclosure -> nothing to transcribe, so it can't become a
        # chapter. Drop it rather than surface an un-actionable result.
        audio_url = entry.get("episodeUrl")
        track_id = entry.get("trackId")
        if not audio_url or track_id is None:
            return None

        millis = entry.get("trackTimeMillis")
        return SearchResult(
            id=f"podcast:{track_id}",
            type="episode",
            title=entry.get("trackName") or "Untitled episode",
            url=audio_url,
            thumbnail=self._artwork(entry),
            duration_s=int(millis) // 1000 if millis else None,
            author=entry.get("collectionName"),  # the show name
            source="podcast",
            meta={
                "feed_url": entry.get("feedUrl"),
                "release_date": entry.get("releaseDate"),
                "episode_page": entry.get("trackViewUrl"),
            },
        )

    @staticmethod
    def _artwork(entry: dict) -> str | None:
        # Prefer the largest artwork iTunes offers; fall back through sizes.
        for key in ("artworkUrl600", "artworkUrl160", "artworkUrl100", "artworkUrl60"):
            if entry.get(key):
                return entry[key]
        return None
