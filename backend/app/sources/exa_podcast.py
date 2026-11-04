"""Published podcast transcripts from Exa's podcast index.

Exa has transcribed millions of episodes, with a named speaker and a timestamp
on every turn. Looking one up is a single search (~$0.007) answered in about a
second, where transcribing the audio costs per minute and takes minutes. So a
selected episode is looked up here first; the speech-to-text path only runs
when Exa doesn't have it.

The lookup searches by the episode's title, then only trusts a result whose
title matches (episode numbers and punctuation aside) and whose length is
close to the one iTunes gave. A near miss such as the next episode of the same
show is rejected: no transcript is better than the wrong one.
"""

import logging
import re
import unicodedata
from difflib import SequenceMatcher

from app.core import gateway
from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.sources.models import Transcript, TranscriptSegment

logger = logging.getLogger(__name__)

ROUTE = gateway.Route(
    treg="exa.web.search.podcasts", monid_provider="exa", monid_endpoint="/search"
)
_TIMEOUT_S = 30.0
_CANDIDATES = 3
_MIN_TITLE_RATIO = 0.85
# A matching title with a very different length is a different cut (trailer,
# rerun, bonus); within this, it's the same episode give or take ads.
_DURATION_SLACK_S = 180
_DURATION_SLACK_RATIO = 0.15

_TURN_RE = re.compile(r"^\*\*(?P<speaker>[^*]+?) · (?P<start>[\d:.]+)–(?P<end>[\d:.]+)\*\*\s*$")
_FIELD_RE = re.compile(r"^- \*\*(?P<key>[^*]+):\*\* (?P<value>.+)$", re.M)
_EPISODE_PREFIX_RE = re.compile(r"^\s*(?:(?:ep(?:isode)?\.?\s*)?#?\d+\s*[.:\-–—|]\s*|ep(?:isode)?\.?\s*#?\d+\s+)", re.I)


def available() -> bool:
    return gateway.available(ROUTE)


def find_transcript(audio_url: str, title: str, duration_s: int | None) -> Transcript | None:
    """The episode's published transcript, or None (not indexed, no confident
    match, or the lookup failed). Never raises."""
    try:
        response = gateway.call(
            ROUTE,
            body={
                "query": title,
                "includeDomains": ["exa.ai/library/podcast"],
                "numResults": _CANDIDATES,
                "contents": {"text": True},
            },
            timeout=_TIMEOUT_S,
        )
    except gateway.GatewayError as exc:
        logger.warning("Exa podcast lookup failed for %r: %s", title, exc)
        return None
    if response.status != 200:
        logger.warning("Exa podcast lookup for %r: HTTP %s", title, response.status)
        return None
    capture_paid_call("exa", "podcast_transcript", settings.exa_price_per_call)

    for row in (response.data or {}).get("results") or []:
        if "/episode/" not in (row.get("url") or "") or not titles_match(title, row.get("title") or ""):
            continue
        language, page_duration, segments = parse_episode_page(row.get("text") or "")
        if not segments:
            continue
        if duration_s and page_duration and not _close(duration_s, page_duration):
            logger.info("Exa episode %r matches by title but not by length (%ss vs %ss)",
                        row.get("title"), duration_s, round(page_duration))
            continue
        logger.info("Podcast transcript from Exa: %r (%d turns)", row.get("title"), len(segments))
        return Transcript(video_id=audio_url, language=language or "", segments=segments)
    logger.info("No Exa transcript matches %r", title)
    return None


def parse_episode_page(text: str) -> tuple[str | None, float | None, list[TranscriptSegment]]:
    """(language, duration in seconds, speaker turns) from an Exa episode page.
    The transcript is the `## Transcript` section; each turn opens with a
    `**Speaker · start–end**` line and runs until the next one."""
    fields = {m["key"].strip().lower(): m["value"].strip() for m in _FIELD_RE.finditer(text)}
    language = (fields.get("language") or "").split("-")[0].lower() or None
    duration = _seconds(fields["duration"]) if "duration" in fields else None

    start = text.find("\n## Transcript")
    if start < 0:
        return language, duration, []
    body = text[start + len("\n## Transcript"):]
    end = body.find("\n## ")
    if end >= 0:
        body = body[:end]

    segments: list[TranscriptSegment] = []
    turn: dict | None = None
    lines: list[str] = []

    def flush():
        words = " ".join(l.strip() for l in lines if l.strip())
        if turn and words:
            s, e = turn["start"], turn["end"]
            segments.append(TranscriptSegment(
                text=words, start_s=s, duration_s=max(e - s, 0.0), speaker=turn["speaker"]
            ))

    for line in body.splitlines():
        m = _TURN_RE.match(line.strip())
        if m:
            flush()
            turn = {"speaker": m["speaker"].strip(), "start": _seconds(m["start"]), "end": _seconds(m["end"])}
            lines = []
        else:
            lines.append(line)
    flush()
    return language, duration, segments


def titles_match(wanted: str, found: str) -> bool:
    a, b = _normalize(wanted), _normalize(found)
    if not a or not b:
        return False
    return a == b or SequenceMatcher(None, a, b).ratio() >= _MIN_TITLE_RATIO


def _normalize(title: str) -> str:
    t = _EPISODE_PREFIX_RE.sub("", unicodedata.normalize("NFKC", title))
    t = re.sub(r"[^\w\s]", " ", t.lower())
    return " ".join(t.split())


def _seconds(stamp: str) -> float:
    total = 0.0
    for part in stamp.split(":"):
        total = total * 60 + float(part)
    return total


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(_DURATION_SLACK_S, _DURATION_SLACK_RATIO * max(a, b))
