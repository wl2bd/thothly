"""What both YouTube backends share: the error, the URL shapes, the track choice."""

import re

from app.pipeline.i18n import normalize_language
from app.sources.models import TrackOption


class YouTubeUnavailable(Exception):
    """YouTube (or the relay in front of it) refused or failed the request.

    Transient by nature (an IP block, a 429, a gateway out of balance), so it is
    never cached as "no subtitles"."""


# A single video's id, in every URL shape YouTube hands out: watch?v=, youtu.be,
# Shorts, lives and embeds. Anything else on youtube.com is a list or a channel.
VIDEO_ID_RE = re.compile(
    r"(?:[?&]v=|youtu\.be/|youtube\.com/(?:shorts|live|embed)/)([A-Za-z0-9_-]{6,})"
)


def video_id(url: str) -> str:
    match = VIDEO_ID_RE.search(url)
    return match.group(1) if match else url.rstrip("/").split("/")[-1]


def watch_url(vid: str) -> str:
    return f"https://www.youtube.com/watch?v={vid}"


def base_language(code: str | None) -> str:
    return normalize_language(code) or ""


def pick_track(
    manual: list[str],
    auto: list[str],
    original: str | None,
    languages: list[str],
    want: str | None = None,
) -> str | None:
    """The caption track to read, among the codes each backend lists.

    `want` is a language the reader chose at review: its added subtitles, else
    its auto-caption, else nothing. Without it:

    1. The video's own language, human subtitles then its auto-caption: a book
       stays in the language it was said in.
    2. Human subtitles in a preferred language (a hand translation).
    3. An auto-caption in a preferred language (may be machine-translated).
    4. Any auto-caption, then any human track.
    """
    if want:
        return _match(manual, want) or _match(auto, want)
    original = base_language(original)
    if original:
        for codes in (manual, auto):
            picked = _match(codes, original)
            if picked:
                return picked
    for codes in (manual, auto):
        for lang in languages:
            picked = _match(codes, lang)
            if picked:
                return picked
    return (auto or manual or [None])[0]


def track_options(
    manual: list[str],
    auto: list[str],
    original: str | None,
    default: str | None,
    dubbed: list[str] = (),
) -> list[TrackOption]:
    """The languages a video can be read in, `default` (the track pick_track
    chose) first: the spoken one, every language a channel added subtitles in,
    then the languages YouTube auto-dubbed it into (the ASR of that dub). Other
    auto-captions are machine translations and are not offered. Empty when
    there is nothing to switch to."""
    original = base_language(original)
    manual_bases = {base_language(code) for code in manual}
    dubbed_bases = {base_language(code) for code in dubbed} - manual_bases
    options: list[TrackOption] = []
    candidates = [
        *((code, None) for code in (default, *manual)),
        *((code, "dubbed") for code in auto if base_language(code) in dubbed_bases),
    ]
    for code, relation in candidates:
        base = base_language(code)
        if not base or any(o.language == base for o in options):
            continue
        if original and base == original:
            relation = "original"
        elif base in dubbed_bases:
            relation = "dubbed"
        elif original and relation is None:
            relation = "translation"
        options.append(TrackOption(language=base, relation=relation))
    return options if len(options) > 1 else []


def _match(codes: list[str], lang: str) -> str | None:
    base = base_language(lang)
    for code in codes:
        if code == lang or base_language(code) == base:
            return code
    return None
