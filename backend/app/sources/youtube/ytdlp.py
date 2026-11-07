"""YouTube through yt-dlp: free, and fine from a residential IP."""

import json

from yt_dlp import YoutubeDL
from yt_dlp.utils import YoutubeDLError

from app.core.config import settings
from app.sources.models import Chapter, Transcript, TranscriptSegment, VideoMeta
from app.sources.youtube.common import (
    YouTubeUnavailable,
    base_language,
    pick_track,
    track_options,
    watch_url,
)


def _lang_extractor_args(langs: list[str] | None = None) -> dict:
    """Tell YouTube which language to return metadata (title, chapters…) in.

    IMPORTANT: this is a localization REQUEST, not "the original". YouTube
    auto-translates the title/chapters to the requested language whenever a
    translation exists — so requesting `en` turns a French video's chapters into
    English ones, clashing with the original-language body. There's no value that
    universally means "original": you have to request each video's OWN language,
    which we only learn after a first extract (info["language"]). See
    `_info_in_original_language`, which re-requests metadata in that language.
    """
    return {"youtube": {"lang": langs or settings.preferred_languages}}


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


def fetch_transcript(video_id: str, want: str | None = None) -> Transcript | None:
    """Fetch a video's subtitles through yt-dlp.

    We go through yt-dlp rather than the lighter timedtext endpoint because it
    emulates a real YouTube client, which is far more resilient to the IP
    rate-limiting/blocking YouTube applies to scrapers. Track preference: human
    subtitles over auto-captions, and among auto-captions the video's *original*
    language over a machine translation (so the body stays coherent with the
    original-language title). Raises YouTubeUnavailable when YouTube refuses the
    request (e.g. an IP block); returns None when no subtitles exist. `want`
    is a language the reader chose at review over the default track.
    """
    url = watch_url(video_id)
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extractor_args": _lang_extractor_args(),
    }
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            manual, auto, original = _caption_tracks(info, want)
            default = pick_track(list(manual), list(auto), original, settings.preferred_languages)
            language = (
                pick_track(list(manual), list(auto), original, settings.preferred_languages, want)
                if want else default
            )
            if language is None:
                return None
            sub_url = _json3_url(manual.get(language) or auto[language])
            raw = ydl.urlopen(sub_url).read().decode("utf-8", "replace")
    except YoutubeDLError as exc:
        raise YouTubeUnavailable(str(exc)) from exc

    segments = _parse_json3(raw)
    if not segments:
        return None
    # The first extract ran in our preferred language, so chapter titles may have
    # come back auto-translated for a non-preferred-language video. Re-request
    # them in the language of the body: the original, or the one the reader chose.
    meta = _info_in_language(url, opts, info, want or base_language(info.get("language")))
    return Transcript(
        video_id=video_id,
        language=language,
        segments=segments,
        chapters=_parse_chapters(meta),
        uploader=info.get("channel") or info.get("uploader") or None,
        channel_url=info.get("channel_url") or info.get("uploader_url") or None,
        tracks=track_options(list(manual), list(auto), original, default),
    )


def _info_in_language(url: str, opts: dict, info: dict, language: str) -> dict:
    """Return info whose metadata (chapter titles) is in `language`, the body's.

    The first extract uses `preferred_languages`, so for a video read in another
    language YouTube may have auto-translated the chapter titles. When the two
    differ, re-extract requesting the body's language (the video's original from
    `info["language"]`, or the one the reader chose) so the chapters match it.
    Skipped when there are no chapters to fix (no extra network call), and
    degrades to the already-fetched info if the re-extract fails.
    """
    preferred = settings.preferred_languages or ["en"]
    requested = base_language(preferred[0])
    language = base_language(language)
    if not info.get("chapters") or not language or language == requested:
        return info
    try:
        with YoutubeDL({**opts, "extractor_args": _lang_extractor_args([language])}) as ydl:
            return ydl.extract_info(url, download=False) or info
    except YoutubeDLError:
        return info


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
    manual, auto, original = _caption_tracks(info, languages=languages)
    code = pick_track(list(manual), list(auto), original, languages)
    if code is None:
        return None
    return code, _json3_url(manual.get(code) or auto[code])


def _caption_tracks(
    info: dict, want: str | None = None, languages: list[str] | None = None
) -> tuple[dict, dict, str]:
    """(added subtitles, real auto-captions, spoken language), formats by code."""
    manual = {c: f for c, f in (info.get("subtitles") or {}).items() if _json3_url(f)}
    original = base_language(info.get("language"))
    languages = [*(languages or settings.preferred_languages), *([want] if want else [])]
    wanted = {original, *(base_language(lang) for lang in languages)} - {""}
    # yt-dlp lists an auto-caption for every language YouTube can machine-translate
    # into, so only the original's and the preferred ones are real candidates.
    auto = {
        c: f
        for c, f in (info.get("automatic_captions") or {}).items()
        if _json3_url(f) and base_language(c) in wanted
    }
    return manual, auto, original


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
        url=watch_url(video_id),
        duration_s=entry.get("duration"),
    )
