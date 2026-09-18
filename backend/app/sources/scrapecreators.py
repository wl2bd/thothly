"""YouTube transcripts through ScrapeCreators, relayed by treg.

YouTube IP-blocks subtitle fetches from datacenter IPs (Fly, Render…), so a
hosted server can't use yt-dlp for them. ScrapeCreators fetches from its own
pool; treg (https://treg.to) holds the ScrapeCreators key and bills per call, so
the server only needs TREG_TOKEN. Active whenever that token is set; otherwise
the app keeps the free yt-dlp path (fine from a residential IP).

Two calls per video (~$0.002 each): the detail call gives the caption tracks,
chapters and channel; the transcript call gives the text. A video with no
caption track stops after the first call. Results land in the transcript cache,
so a video is paid for once, ever.
"""

import httpx

from app.core.config import settings
from app.sources.models import Chapter, Transcript, TranscriptSegment
from app.sources.youtube import YouTubeUnavailable

_TIMEOUT_S = 60.0


def fetch_transcript(video_id: str, languages: list[str] | None = None) -> Transcript | None:
    url = f"https://www.youtube.com/watch?v={video_id}"
    detail = _call("scrapecreators.youtube.video.detail", url=url)
    language = _pick_language(detail.get("captionTracks") or [], languages or settings.preferred_languages)
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


def _call(endpoint: str, **params: str) -> dict:
    try:
        response = httpx.get(
            f"{settings.treg_base_url}/{endpoint}",
            params=params,
            headers={"X-Treg-Token": settings.treg_token or ""},
            timeout=_TIMEOUT_S,
        )
    except httpx.HTTPError as exc:
        raise YouTubeUnavailable(f"ScrapeCreators unreachable: {exc}") from exc
    if response.status_code == 404:  # removed/private video: nothing to read
        return {}
    if response.status_code != 200:
        # 402 (treg balance), 429/5xx (provider): transient, never cached as "no subtitles".
        raise YouTubeUnavailable(f"ScrapeCreators {endpoint} HTTP {response.status_code}")
    return response.json()


def _pick_language(tracks: list[dict], languages: list[str]) -> str | None:
    """Same preference as the yt-dlp path: human subtitles in a preferred
    language, else the auto-caption (ASR is always the original language, never
    a translation), else any human track."""
    manual = [t["languageCode"] for t in tracks if t.get("kind") != "asr" and t.get("languageCode")]
    auto = [t["languageCode"] for t in tracks if t.get("kind") == "asr" and t.get("languageCode")]
    for lang in languages:
        for code in manual:
            if code == lang or code.split("-")[0] == lang:
                return code
    return (auto or manual or [None])[0]


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
