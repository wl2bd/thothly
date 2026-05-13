from datetime import datetime

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from app.sources.models import Transcript, TranscriptSegment, VideoMeta


class YouTubeUnavailable(Exception):
    pass


class TranscriptNotFound(Exception):
    pass


_YDL_OPTS: dict = {
    "extract_flat": True,
    "quiet": True,
    "no_warnings": True,
}


def list_videos(url: str) -> list[VideoMeta]:
    with YoutubeDL(_YDL_OPTS) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except DownloadError as exc:
            raise YouTubeUnavailable(str(exc)) from exc

    entries = info.get("entries") or []
    return [_entry_to_video_meta(e) for e in entries if e is not None]


def fetch_transcript(
    video_id: str,
    languages: list[str] | None = None,
) -> Transcript | None:
    if languages is None:
        languages = ["fr", "en"]

    api = YouTubeTranscriptApi()
    try:
        transcript_list = api.list(video_id)
        transcript = transcript_list.find_transcript(languages)
        fetched = transcript.fetch()
    except (TranscriptsDisabled, NoTranscriptFound):
        return None
    except CouldNotRetrieveTranscript as exc:
        raise YouTubeUnavailable(str(exc)) from exc

    segments = [
        TranscriptSegment(text=s.text, start_s=s.start, duration_s=s.duration)
        for s in fetched
    ]
    return Transcript(
        video_id=video_id,
        language=transcript.language_code,
        segments=segments,
    )


def _entry_to_video_meta(entry: dict) -> VideoMeta:
    video_id = entry.get("id", "")
    return VideoMeta(
        id=video_id,
        title=entry.get("title", ""),
        url=f"https://www.youtube.com/watch?v={video_id}",
        duration_s=entry.get("duration"),
        published_at=_parse_upload_date(entry.get("upload_date")),
    )


def _parse_upload_date(upload_date: str | None) -> datetime | None:
    if not upload_date:
        return None
    try:
        return datetime.strptime(upload_date, "%Y%m%d")
    except ValueError:
        return None
