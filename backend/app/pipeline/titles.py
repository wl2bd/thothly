"""Normalize a source title's FORM without touching its meaning.

Retrieved titles are inconsistent in shape: podcast episodes shout an episode
number up front ("#2519 - Scott Eastwood"), YouTube hooks SHOUT IN ALL CAPS
("KILL YOUR EXCUSES - Motivational Speech"), and many carry a trailing channel
tag ("… | Joe Rogan"). This module evens out those FORMAL quirks so chapter
headings read as one edition, while leaving the words themselves untouched — no
rewriting, no translation, no summarizing. It's deliberately zero-LLM: every
rule is a cheap, predictable transform.

Only the chapter HEADING is normalized; the raw title is kept verbatim in the
source data and the EPUB metadata.
"""

import re

# Words a title-case keeps lowercase unless they lead or close the line.
_SMALL = {
    "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
    "nor", "of", "on", "or", "over", "per", "the", "to", "up", "via", "vs",
    "with", "off", "out", "than",
}

# A leading episode marker: "#2519 - ", "Ep. 42: ", "Episode 12 — ", "Part 3: ".
# Requires a digit AND a trailing separator, so a real leading number that's part
# of the title ("12 Rules for Life") is never touched.
_EP_PREFIX = re.compile(
    r"^\s*(?:#\s*\d+|(?:episode|ep|chapter|ch|part|pt|vol|e)\.?\s*\d+)\s*[-–—:|.]\s+",
    re.IGNORECASE,
)

# Segment separators, kept in the split so they can be rejoined unchanged.
_SEG_SPLIT = re.compile(r"(\s+[-–—|]\s+|:\s+)")

# A word for shout-detection: letters plus inline apostrophes / a censor star.
_WORD = re.compile(r"[A-Za-z][A-Za-z'’*]*")


def normalize_title(raw: str) -> str:
    """Tidy a title's form. Returns the raw title unchanged if tidying empties it."""
    text = " ".join(raw.split())
    text = _strip_channel_suffix(text)
    text = _EP_PREFIX.sub("", text, count=1)
    text = _deshout(text)
    text = " ".join(text.split()).strip()
    return text or raw.strip()


def _strip_channel_suffix(text: str) -> str:
    """Drop a trailing channel/show tag: a final ` | …` (pipe is near-always a
    separator, not content) or an explicit ` - YouTube` platform tag."""
    text = re.sub(r"\s*\|\s*[^|]+$", "", text)
    text = re.sub(r"\s*[-–—]\s*YouTube(?:\s+Music)?$", "", text, flags=re.IGNORECASE)
    return text


def _deshout(text: str) -> str:
    """Title-case any SHOUTED segment, leaving mixed-case segments (and their
    acronyms) alone — so "SACRIFICE - Motivational Speech" loses only the shout."""
    return "".join(
        _titlecase(part) if _is_shout(part) else part
        for part in _SEG_SPLIT.split(text)
    )


def _is_shout(segment: str) -> bool:
    """True when a segment is ALL CAPS and substantial enough to be shouting
    rather than a lone acronym (≥2 words, or a single word of ≥5 letters)."""
    letters = [c for c in segment if c.isalpha()]
    if not letters or not all(c.isupper() for c in letters):
        return False
    words = _WORD.findall(segment)
    return len(words) >= 2 or (len(words) == 1 and len(words[0]) >= 5)


def _titlecase(segment: str) -> str:
    """Smart title-case a (shouted) segment: small words stay lowercase unless
    they lead or close it; everything else gets an initial capital."""
    words = segment.split()
    last = len(words) - 1
    out: list[str] = []
    for i, word in enumerate(words):
        lower = word.lower()
        if 0 < i < last and lower in _SMALL:
            out.append(lower)
        else:
            out.append(_cap_first(lower))
    return " ".join(out)


def _cap_first(word: str) -> str:
    """Capitalize the first alphabetic character, leave the rest as-is."""
    for i, ch in enumerate(word):
        if ch.isalpha():
            return word[:i] + ch.upper() + word[i + 1:]
    return word
