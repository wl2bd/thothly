from datetime import datetime

from youtube_transcript_api import (
    CouldNotRetrieveTranscript,
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

from app.core.config import settings
from app.sources.models import Transcript, TranscriptSegment, VideoMeta


class YouTubeUnavailable(Exception):
    pass


class TranscriptNotFound(Exception):
    pass


def _lang_extractor_args() -> dict:
    """Ask YouTube for metadata in our preferred language(s).

    Without this, titles come back localized to the viewer's UI language
    (e.g. an English UI turns a French video's title into an English
    auto-translation), which then clashes with the original-language
    transcript. Requesting the original language keeps title and body coherent.
    """
    return {"youtube": {"lang": settings.preferred_languages}}


_YDL_OPTS: dict = {
    "extract_flat": True,
    "quiet": True,
    "no_warnings": True,
    "extractor_args": _lang_extractor_args(),
}


def list_videos(url: str) -> list[VideoMeta]:
    with YoutubeDL(_YDL_OPTS) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except DownloadError as exc:
            raise YouTubeUnavailable(str(exc)) from exc

    entries = info.get("entries") or []
    return [_entry_to_video_meta(e) for e in entries if e is not None]


def fetch_video_meta(url: str) -> VideoMeta:
    """Metadata for a single video URL (title, duration) without downloading."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extractor_args": _lang_extractor_args(),
    }
    with YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except DownloadError as exc:
            raise YouTubeUnavailable(str(exc)) from exc
    return _entry_to_video_meta(info)


def fetch_transcript(
    video_id: str,
    languages: list[str] | None = None,
) -> Transcript | None:
    if languages is None:
        languages = settings.preferred_languages

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
