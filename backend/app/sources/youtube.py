import json
from datetime import datetime

from yt_dlp import YoutubeDL
from yt_dlp.utils import YoutubeDLError

from app.core.config import settings
from app.sources.models import Chapter, Transcript, TranscriptSegment, VideoMeta


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


def list_videos(url: str) -> tuple[str | None, list[VideoMeta]]:
    """Return the (collection title, videos) for a playlist or channel.

    The title (playlist name / channel name) comes from the same extract_info
    call, so capturing it costs nothing extra — it feeds a meaningful default
    book title.
    """
    with YoutubeDL(_YDL_OPTS) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except YoutubeDLError as exc:
            raise YouTubeUnavailable(str(exc)) from exc

    entries = info.get("entries") or []
    videos = [_entry_to_video_meta(e) for e in entries if e is not None]
    return info.get("title"), videos


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
        except YoutubeDLError as exc:
            raise YouTubeUnavailable(str(exc)) from exc
    return _entry_to_video_meta(info)


def fetch_transcript(
    video_id: str,
    languages: list[str] | None = None,
) -> Transcript | None:
    """Fetch a video's subtitles through yt-dlp.

    We go through yt-dlp rather than the lighter timedtext endpoint because it
    emulates a real YouTube client, which is far more resilient to the IP
    rate-limiting/blocking YouTube applies to scrapers. Track preference: human
    subtitles over auto-captions, and among auto-captions the video's *original*
    language over a machine translation (so the body stays coherent with the
    original-language title). Raises YouTubeUnavailable when YouTube refuses the
    request (e.g. an IP block); returns None when no subtitles exist.
    """
    if languages is None:
        languages = settings.preferred_languages

    url = f"https://www.youtube.com/watch?v={video_id}"
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extractor_args": _lang_extractor_args(),
    }
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            track = _pick_subtitle_track(info, languages)
            if track is None:
                return None
            language, sub_url = track
            raw = ydl.urlopen(sub_url).read().decode("utf-8", "replace")
    except YoutubeDLError as exc:
        raise YouTubeUnavailable(str(exc)) from exc

    segments = _parse_json3(raw)
    if not segments:
        return None
    return Transcript(
        video_id=video_id,
        language=language,
        segments=segments,
        chapters=_parse_chapters(info),
        uploader=info.get("channel") or info.get("uploader") or None,
        channel_url=info.get("channel_url") or info.get("uploader_url") or None,
    )


def fetch_channel_avatar_url(channel_url: str) -> str | None:
    """Return a channel's avatar image URL, or None if unavailable.

    Extracts only the channel's own metadata (playlist_items="0" skips listing
    its videos, keeping this to one cheap call) and picks the uncropped avatar.
    The avatar lives on yt3.googleusercontent.com — outside the subtitle
    endpoints YouTube IP-blocks — so the cover emblem still works even when
    transcript fetches are being rate-limited. Best-effort: any failure returns
    None so the book simply falls back to the bundled emblem.
    """
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": True,
        "playlist_items": "0",
        "extractor_args": _lang_extractor_args(),
    }
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(channel_url, download=False)
    except YoutubeDLError:
        return None
    return _pick_avatar(info.get("thumbnails") or [])


def _pick_avatar(thumbnails: list[dict]) -> str | None:
    """The channel avatar URL: the uncropped one, else the largest square icon.

    yt-dlp tags the avatar "avatar_uncropped"; the wide "banner_uncropped" is
    deliberately ignored. The square-icon fallback covers extractor changes.
    """
    by_id = {t.get("id"): t.get("url") for t in thumbnails}
    if by_id.get("avatar_uncropped"):
        return by_id["avatar_uncropped"]
    squares = [
        t
        for t in thumbnails
        if t.get("url") and t.get("width") and t.get("height")
        and abs(t["width"] - t["height"]) <= 2
    ]
    if squares:
        return max(squares, key=lambda t: t["width"])["url"]
    return None


def _parse_chapters(info: dict) -> list[Chapter]:
    """Read YouTube's timestamped chapters, if the video defines them."""
    chapters: list[Chapter] = []
    for chapter in info.get("chapters") or []:
        title = (chapter.get("title") or "").strip()
        start = chapter.get("start_time")
        end = chapter.get("end_time")
        if title and start is not None and end is not None:
            chapters.append(Chapter(title=title, start_s=float(start), end_s=float(end)))
    return chapters


def _pick_subtitle_track(info: dict, languages: list[str]) -> tuple[str, str] | None:
    """Choose (language_code, json3_url) for the best available subtitle track."""
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    original = (info.get("language") or "").split("-")[0]

    # 1) Human-made subtitles in a preferred language.
    for lang in languages:
        picked = _match_track(manual, lang)
        if picked:
            return picked
    # 2) The original-language auto-caption (real ASR, never a translation).
    if original:
        picked = _match_track(auto, original)
        if picked:
            return picked
    # 3) Last resort: an auto-caption in a preferred language (may be translated).
    for lang in languages:
        picked = _match_track(auto, lang)
        if picked:
            return picked
    return None


def _match_track(tracks: dict, lang: str) -> tuple[str, str] | None:
    """Find a track whose code matches lang exactly or by base (fr ~ fr-FR)."""
    for code, formats in tracks.items():
        if code == lang or code.split("-")[0] == lang:
            url = _json3_url(formats)
            if url:
                return code, url
    return None


def _json3_url(formats: list[dict]) -> str | None:
    for fmt in formats:
        if fmt.get("ext") == "json3" and fmt.get("url"):
            return fmt["url"]
    return None


def _parse_json3(raw: str) -> list[TranscriptSegment]:
    """Parse YouTube's json3 caption payload into timed segments."""
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []

    segments: list[TranscriptSegment] = []
    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = "".join(seg.get("utf8", "") for seg in segs).strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                text=text,
                start_s=event.get("tStartMs", 0) / 1000.0,
                duration_s=event.get("dDurationMs", 0) / 1000.0,
            )
        )
    return segments


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
