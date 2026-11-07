"""YouTube transcripts through ScrapeCreators, relayed by treg.

YouTube IP-blocks subtitle fetches from datacenter IPs (Fly, Render…), so a
hosted server can't use yt-dlp for them. ScrapeCreators fetches from its own
pool; treg (https://treg.to) holds the ScrapeCreators key and bills per call, so
the server only needs TREG_TOKEN. Active whenever that token is set; otherwise
the app keeps the free yt-dlp path (fine from a residential IP).

Two calls per video (~$0.002 each): the detail call gives the caption tracks,
chapters and channel; the transcript call gives the text. A video with no
caption track stops after the first call. Both answers sit in the gateway cache
and the transcript in the transcript cache, so a video is paid for once.
"""

from app.core import gateway
from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.sources.models import Chapter, Transcript, TranscriptSegment, VideoMeta
from app.sources.youtube.common import YouTubeUnavailable, pick_track, watch_url

_TIMEOUT_S = 60.0
# Discovery asks for a video's detail (title, length), then its transcript asks
# again: the gateway cache makes the second ask free.
_TTL_S = {
    "scrapecreators.youtube.video.detail": gateway.DETAIL_TTL_S,
    "scrapecreators.x.v1-youtube-video-transcript": gateway.TRANSCRIPT_TTL_S,
}


def fetch_transcript(video_id: str) -> Transcript | None:
    url = watch_url(video_id)
    detail = _call("scrapecreators.youtube.video.detail", url=url)
    language = _pick_language(
        detail.get("captionTracks") or [],
        settings.preferred_languages,
        detail.get("audioTracks") or [],
    )
    if language is None:
        return None
    payload = _call("scrapecreators.x.v1-youtube-video-transcript", url=url, language=language)
    segments = _parse_segments(payload.get("transcript") or [])
    if not segments:
        return None
    channel = detail.get("channel") or {}
    return Transcript(
        video_id=video_id,
        language=language,
        segments=segments,
        chapters=_parse_chapters(detail.get("chapters") or [], (detail.get("durationMs") or 0) / 1000),
        uploader=channel.get("title"),
        channel_url=channel.get("url"),
    )


def fetch_video_meta(url: str) -> VideoMeta:
    """Title and duration of one video. yt-dlp's full extraction hits YouTube's
    "confirm you're not a bot" wall from datacenter IPs, like the subtitles."""
    detail = _call("scrapecreators.youtube.video.detail", url=url)
    if not detail.get("id"):
        raise YouTubeUnavailable(f"ScrapeCreators has no video at {url}")
    duration_ms = detail.get("durationMs")
    return VideoMeta(
        id=detail["id"],
        title=detail.get("title") or "",
        url=watch_url(detail["id"]),
        duration_s=round(duration_ms / 1000) if duration_ms else None,
    )


def _call(endpoint: str, **params: str) -> dict:
    try:
        route = gateway.Route(treg=endpoint, cache_ttl_s=_TTL_S.get(endpoint))
        response = gateway.call(route, params=params, timeout=_TIMEOUT_S)
    except gateway.GatewayError as exc:
        # 402 (treg balance), 429/5xx (provider), unreachable: transient, never
        # cached as "no subtitles". ScrapeCreators isn't on Monid, so no fallback.
        raise YouTubeUnavailable(f"ScrapeCreators {endpoint}: {exc}") from exc
    if response.status in (200, 404) and not response.cached:  # scraped, so billed
        capture_paid_call("scrapecreators", endpoint, settings.scrapecreators_price_per_call)
    if response.status == 404:  # removed/private video: nothing to read
        return {}
    if response.status != 200:
        raise YouTubeUnavailable(f"ScrapeCreators {endpoint} HTTP {response.status}")
    if not isinstance(response.data, dict):  # garbled: a failure, not "no subtitles"
        raise YouTubeUnavailable(f"ScrapeCreators {endpoint}: unreadable response")
    return response.data


def _pick_language(tracks: list[dict], languages: list[str], audio_tracks: list[dict] | None = None) -> str | None:
    """On an auto-dubbed video YouTube runs ASR on every dubbed audio track, so
    "asr" no longer means "original": the original is the default, non-dubbed
    audio track."""
    manual = [t["languageCode"] for t in tracks if t.get("kind") != "asr" and t.get("languageCode")]
    auto = [t["languageCode"] for t in tracks if t.get("kind") == "asr" and t.get("languageCode")]
    return pick_track(manual, auto, _original_audio_language(audio_tracks or []), languages)


def _original_audio_language(audio_tracks: list[dict]) -> str | None:
    """The original audio's language ("en-US.4" -> "en-US"), or None."""
    for track in audio_tracks:
        if track.get("audioIsDefault") and not track.get("isAutoDubbed") and track.get("id"):
            return track["id"].split(".")[0]
    return None


def _parse_segments(rows: list[dict]) -> list[TranscriptSegment]:
    segments = []
    for row in rows:
        text = (row.get("text") or "").strip()
        if not text:
            continue
        start = int(row.get("startMs") or 0)
        end = int(row.get("endMs") or start)
        segments.append(TranscriptSegment(text=text, start_s=start / 1000, duration_s=max(end - start, 0) / 1000))
    return segments


def _parse_chapters(rows: list[dict], duration_s: float) -> list[Chapter]:
    """ScrapeCreators gives each chapter's start only; its end is the next start
    (the last one ends with the video)."""
    starts = [(r["title"].strip(), float(r["startSeconds"])) for r in rows if r.get("title") and r.get("startSeconds") is not None]
    chapters = []
    for i, (title, start) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else max(duration_s, start)
        chapters.append(Chapter(title=title, start_s=start, end_s=end))
    return chapters
