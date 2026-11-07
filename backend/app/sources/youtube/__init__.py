"""YouTube, whichever backend reaches it.

With TREG_TOKEN set, video details and transcripts come from ScrapeCreators
through treg, because YouTube IP-blocks yt-dlp from datacenter hosts. Without
it, yt-dlp reads YouTube directly. Playlists, channels and avatars always go
through yt-dlp: they aren't behind the block.
"""

from app.core.config import settings
from app.sources.models import Transcript, VideoMeta
from app.sources import transcript_cache
from app.sources.youtube import scrapecreators, ytdlp
from app.sources.youtube.common import (
    VIDEO_ID_RE,
    YouTubeUnavailable,
    video_id,
    watch_url,
)
from app.sources.youtube.ytdlp import fetch_channel_avatar_url, list_videos

__all__ = [
    "VIDEO_ID_RE",
    "YouTubeUnavailable",
    "fetch_channel_avatar_url",
    "fetch_video_meta",
    "list_videos",
    "load_transcript",
    "paid_backend",
    "video_id",
    "watch_url",
]


def paid_backend() -> bool:
    return bool(settings.treg_token)


def fetch_video_meta(url: str) -> VideoMeta:
    backend = scrapecreators if paid_backend() else ytdlp
    return backend.fetch_video_meta(watch_url(video_id(url)))


def load_transcript(vid: str) -> Transcript | None:
    """The video's transcript, fetched once. A refusal (YouTubeUnavailable) is
    raised, never stored as "no subtitles"."""
    cached = transcript_cache.get(vid)
    if cached is not None:
        return cached
    backend = scrapecreators if paid_backend() else ytdlp
    transcript = backend.fetch_transcript(vid)
    if transcript is not None:
        transcript_cache.put(vid, transcript)
    return transcript
