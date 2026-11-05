"""Transcripts a podcast publishes in its own RSS feed (`<podcast:transcript>`).

Free, and the show's own text, so it is tried before Exa and before any
transcription. About one show in six has them (measured on iTunes search
results, Nov 2026): hosts like Buzzsprout, Captivate, Ausha, Omny, Substack and
Podbean write the tag; Spotify for Creators (ex-Anchor) never does.

The search result hands us the show's feed URL. The episode is found in it by
its audio file (tracking prefixes like podtrac wrap the same file name) or, as
a fallback, by its exact title. A feed can list the same transcript in several
formats; the most structured one is read first, and the next is tried when a
link is broken.
"""

import json
import logging
import re
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from app.core.net import BlockedURLError, assert_public_url
from app.sources.models import Transcript, TranscriptSegment

logger = logging.getLogger(__name__)

_NS = "{https://podcastindex.org/namespace/1.0}"
_TIMEOUT_S = 20.0
_MAX_BYTES = 15 * 1024 * 1024  # long-running feeds run to several MB
_MAX_REDIRECTS = 5
_UA = "Thothly/1.0 (+https://thothly.vercel.app)"

# Most structured first: timings and speakers beat timings, beat bare text.
_PREFERENCE = ("application/json", "text/vtt", "application/srt", "application/x-subrip", "text/plain", "text/html")

_TIME_RE = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
_VOICE_RE = re.compile(r"<v(?:\.[^ >]*)?\s+([^>]+)>")
_TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class TranscriptTag:
    url: str
    type: str
    language: str | None


def find_transcript(feed_url: str, audio_url: str, title: str | None) -> Transcript | None:
    """The episode's transcript from its feed, or None. Never raises."""
    try:
        feed = _get_text(feed_url)
        if not feed:
            return None
        tags, channel_lang = transcript_tags(feed, audio_url, title)
        for tag in tags:
            body = _get_text(tag.url)
            segments = parse_transcript(body, tag.type) if body else []
            if segments:
                language = _base_lang(tag.language) or channel_lang or ""
                return Transcript(video_id=audio_url, language=language, segments=segments)
    except Exception as exc:  # noqa: BLE001 - Exa and transcription still get their turn
        logger.warning("RSS transcript lookup failed for %s: %s", audio_url, exc)
    return None


def transcript_tags(feed: str, audio_url: str, title: str | None) -> tuple[list[TranscriptTag], str | None]:
    """The episode's transcript links, best format first, and the show language."""
    try:
        root = ET.fromstring(feed.encode("utf-8") if isinstance(feed, str) else feed)
    except ET.ParseError:
        return [], None
    channel = root.find("channel")
    if channel is None:
        return [], None
    channel_lang = _base_lang(channel.findtext("language"))
    items = channel.findall("item")
    item = _match_item(items, audio_url, title)
    if item is None:
        return [], channel_lang
    tags = [
        TranscriptTag(url=t.get("url", ""), type=(t.get("type") or "").lower(), language=t.get("language"))
        for t in item.findall(f"{_NS}transcript")
        if t.get("url")
    ]
    tags.sort(key=lambda t: _PREFERENCE.index(t.type) if t.type in _PREFERENCE else len(_PREFERENCE))
    return tags, channel_lang


def _match_item(items: list[ET.Element], audio_url: str, title: str | None) -> ET.Element | None:
    wanted = _file_key(audio_url)
    for item in items:
        enclosure = item.find("enclosure")
        found = _file_key(enclosure.get("url", "")) if enclosure is not None else None
        if wanted and found and (found.endswith(wanted) or wanted.endswith(found)):
            return item
    if title:
        target = _norm_title(title)
        for item in items:
            if _norm_title(item.findtext("title") or "") == target:
                return item
    return None


def _file_key(url: str) -> str | None:
    """Host + path of an audio URL, query dropped. Tracking redirects (podtrac,
    chartable...) prepend their own host to the real one, so two keys of the
    same file end the same way."""
    try:
        u = httpx.URL(url)
    except Exception:  # noqa: BLE001
        return None
    if not u.host or "." not in u.path.rsplit("/", 1)[-1]:
        return None
    return f"/{u.host}{u.path}".lower()


def _norm_title(title: str) -> str:
    t = unicodedata.normalize("NFKC", title).casefold()
    return " ".join(re.sub(r"[^\w]+", " ", t).split())


def _base_lang(lang: str | None) -> str | None:
    return lang.strip().split("-")[0].split("_")[0].lower() or None if lang else None


# --- parsing --------------------------------------------------------------------

def parse_transcript(body: str, mime: str) -> list[TranscriptSegment]:
    if mime == "application/json":
        return _parse_json(body)
    if mime in ("text/vtt", "application/srt", "application/x-subrip"):
        return _parse_cues(body)
    if mime == "text/html":
        soup = BeautifulSoup(body, "html.parser")
        paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        return _flat(paragraphs)
    return _flat(re.split(r"\n\s*\n", body))


def _parse_json(body: str) -> list[TranscriptSegment]:
    data = json.loads(body)
    out: list[TranscriptSegment] = []
    for s in data.get("segments") or []:
        text = (s.get("body") or "").strip()
        if not text:
            continue
        start = float(s.get("startTime") or 0)
        end = float(s.get("endTime") or start)
        out.append(TranscriptSegment(text=text, start_s=start, duration_s=max(0.0, end - start), speaker=s.get("speaker") or None))
    return out


def _parse_cues(body: str) -> list[TranscriptSegment]:
    """SRT and WebVTT share their cue shape: a `start --> end` line, then text."""
    out: list[TranscriptSegment] = []
    for block in re.split(r"\r?\n\s*\r?\n", body.replace("﻿", "")):
        lines = block.strip().splitlines()
        idx = next((i for i, line in enumerate(lines) if "-->" in line), None)
        if idx is None:
            continue
        start_raw, _, end_raw = lines[idx].partition("-->")
        start, end = _seconds(start_raw), _seconds(end_raw)
        if start is None:
            continue
        raw = " ".join(line.strip() for line in lines[idx + 1:])
        voice = _VOICE_RE.search(raw)
        text = " ".join(_TAG_RE.sub("", raw).split())
        if not text:
            continue
        out.append(
            TranscriptSegment(
                text=text,
                start_s=start,
                duration_s=max(0.0, (end or start) - start),
                speaker=voice.group(1).strip() if voice else None,
            )
        )
    return out


def _seconds(stamp: str) -> float | None:
    m = _TIME_RE.search(stamp)
    if not m:
        return None
    h, mnt, s, ms = m.groups()
    return int(h or 0) * 3600 + int(mnt) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000


def _flat(paragraphs: list[str]) -> list[TranscriptSegment]:
    texts = [" ".join(p.split()) for p in paragraphs]
    return [TranscriptSegment(text=t, start_s=0.0, duration_s=0.0) for t in texts if t]


# --- network --------------------------------------------------------------------

def _get_text(url: str) -> str | None:
    """GET a feed or transcript file, re-checking every redirect hop against the
    SSRF guard, with a byte cap. None on any failure."""
    try:
        with httpx.Client(follow_redirects=False, timeout=_TIMEOUT_S, headers={"User-Agent": _UA}) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                assert_public_url(url)
                with client.stream("GET", url) as response:
                    if response.is_redirect and response.headers.get("location"):
                        url = str(httpx.URL(url).join(response.headers["location"]))
                        continue
                    if response.status_code != 200:
                        return None
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data += chunk
                        if len(data) > _MAX_BYTES:
                            return None
                    return data.decode(response.encoding or "utf-8", errors="replace")
    except (httpx.HTTPError, BlockedURLError) as exc:
        logger.info("Could not fetch %s: %s", url, exc)
    return None
