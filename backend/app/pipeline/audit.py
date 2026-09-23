"""Measure what a compile did to the author's words, without reading the book.

A compilation is too long to proofread on every run, so this scores each
chapter against the zero-LLM rendering of the same source — the text we would
have shipped with AI polish off. Every number is mechanical: no model is called,
nothing is judged on taste. The point is triage. A chapter that comes back clean
is not worth your time; a chapter that lost a fifth of its words, or kept an
`[Applause]` cue, or reads in paragraphs of suspiciously equal length, is.

The checks map to the two ways a compilation fails:

  FIDELITY — the model was asked to transform, not to author. Losing content,
  inflating it, or drifting from the source sequence are all defects even when
  the result reads well.

  BOOK-LIKENESS — captions carry marks of their medium (sound cues, "link in
  the description", mechanical paragraphing) that no real book has. They are
  faithful to the source and still wrong in a book.
"""

import re
import statistics
from dataclasses import dataclass, field
from difflib import SequenceMatcher

# Ignore case and punctuation: adding punctuation is exactly what the polish
# roles are for, so it must not register as a change in content.
_WORD_RE = re.compile(r"[^\w]+", re.UNICODE)

# YouTube writes these into the subtitle track itself. They are faithful to the
# video and meaningless on a page.
_SOUND_CUE = re.compile(r"\[(music|applause|laughter|musique|applaudissements|rires)[^\]]*\]", re.I)

# A model that starts answering instead of transforming. Anchored at the start
# of the text, where a preamble lands; the same words mid-chapter are the
# author's own.
_META_TEXT = re.compile(
    r"\A\s*(here (?:is|'s)|voici|certainly|bien sûr|sure[,!]|as requested|"
    r"the (?:corrected|edited|cleaned)|le texte (?:corrigé|édité))\b",
    re.I,
)

# Speech that addresses a viewer or points at the medium. The single most
# reliable tell that a chapter still reads as a video.
_MEDIUM_TALK = re.compile(
    r"\b(in (?:this|today'?s) video|dans (?:cette|la) vidéo|link in the description|"
    r"lien (?:en|dans la) description|(?:don'?t forget to )?subscribe\b|"
    r"abonnez[- ]vous|abonne[- ]toi|(?:vous |t')?abonner à (?:la |ma |cette )?chaîne|"
    r"like (?:and|et) subscribe|smash that like|lâchez un like|"
    r"hit the bell|cliquez sur la cloche)",
    re.I,
)

# Sponsor reads announce themselves: the segment is almost always introduced by
# a thank-you or a discount code. Detection only — removal is a separate,
# LLM-assisted pass, since the boundaries are a judgement call.
_SPONSOR_HINT = re.compile(
    r"\b(sponsor(?:ed|s|ise|isé)?\s+(?:by|par)|this (?:video|episode) is sponsored|"
    r"merci à .{0,40} de sponsoriser|promo ?code|code promo|use (?:my|the) code|"
    r"avec le code|% ?off (?:your|with)|premier(?:s)? (?:mois|abonnement) offert)\b",
    re.I,
)

_NUMBER_RE = re.compile(r"\b\d[\d  .,]*\b")


def _words(text: str) -> list[str]:
    return _WORD_RE.sub(" ", text.lower()).split()


def _numbers(text: str) -> set[str]:
    """Figures as the reader would check them, with thousands separators and
    trailing punctuation stripped so "1,500." and "1500" compare equal."""
    return {n.replace(" ", "").replace(" ", "").replace(",", "").replace(".", "").strip()
            for n in _NUMBER_RE.findall(text)} - {""}


@dataclass
class ChapterAudit:
    """One chapter's score card. `flags` is what a human should look at."""

    title: str
    src_words: int
    out_words: int
    word_ratio: float
    similarity: float
    paragraphs: int
    para_rhythm: float  # 0 = every paragraph the same length, higher = varied
    lost_numbers: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not self.flags


# A paragraph layout this regular cannot have come from meaning: it is a
# character counter cutting every N characters. Measured as the coefficient of
# variation (stdev / mean) of paragraph lengths — scale-free, so it compares
# across short and long chapters alike.
MECHANICAL_RHYTHM = 0.18

# Below this, the model dropped material it was not asked to drop. Above the
# upper bound it invented some. Both are wider than the live validators, which
# work per 1200-word chunk: whole-chapter totals average out, so an alert here
# means something substantial went missing.
MIN_RATIO = 0.80
MAX_RATIO = 1.10


def audit_chapter(title: str, source_md: str, output_md: str) -> ChapterAudit:
    """Compare the shipped chapter against its zero-LLM rendering."""
    src, out = _words(source_md), _words(output_md)
    ratio = len(out) / len(src) if src else 1.0
    similarity = (
        SequenceMatcher(None, src, out, autojunk=False).ratio() if src and out else 0.0
    )

    paragraphs = [p for p in output_md.split("\n\n") if p.strip()]
    lengths = [len(p) for p in paragraphs]
    rhythm = (
        statistics.pstdev(lengths) / statistics.mean(lengths)
        if len(lengths) > 1 and statistics.mean(lengths)
        else 0.0
    )

    lost = sorted(_numbers(source_md) - _numbers(output_md))

    flags: list[str] = []
    if ratio < MIN_RATIO:
        flags.append(f"lost {(1 - ratio) * 100:.0f}% of the words")
    elif ratio > MAX_RATIO:
        flags.append(f"added {(ratio - 1) * 100:.0f}% more words")
    if lost:
        flags.append(f"{len(lost)} figure(s) dropped: {', '.join(lost[:5])}")
    if _META_TEXT.search(output_md):
        flags.append("opens with model preamble")
    if _SOUND_CUE.search(output_md):
        flags.append("sound cues left in")
    if _MEDIUM_TALK.search(output_md):
        flags.append("addresses a viewer / points at the video")
    if _SPONSOR_HINT.search(output_md):
        flags.append("sponsor read present")
    if len(paragraphs) > 3 and rhythm < MECHANICAL_RHYTHM:
        flags.append("paragraphs cut by length, not by meaning")

    return ChapterAudit(
        title=title,
        src_words=len(src),
        out_words=len(out),
        word_ratio=ratio,
        similarity=similarity,
        paragraphs=len(paragraphs),
        para_rhythm=rhythm,
        lost_numbers=lost,
        flags=flags,
    )


def split_chapters(book_md: str) -> dict[str, str]:
    """The book's Markdown back into {chapter title: body}.

    Chapters are the H1s (`CompiledBook.to_markdown`); the generated "Sources"
    index and "Preface" are front matter, not chapters, so they are left out.
    """
    out: dict[str, str] = {}
    title: str | None = None
    body: list[str] = []
    for line in book_md.splitlines():
        if line.startswith("# "):
            if title is not None:
                out[title] = "\n".join(body).strip()
            title, attrs = _heading(line[2:])
            if ".front-matter" in attrs:
                title = _FRONT_MATTER
            body = []
        elif title is not None:
            body.append(line)
    if title is not None:
        out[title] = "\n".join(body).strip()
    out.pop(_FRONT_MATTER, None)
    # Books compiled before the front matter was marked: English headings.
    out.pop("Sources", None)
    out.pop("Preface", None)
    return out


_FRONT_MATTER = "\0front-matter"
_ATTRS = re.compile(r"\s*\{([^{}]*)\}\s*$")


def _heading(text: str) -> tuple[str, str]:
    """A heading's title and its trailing Pandoc attributes ("{lang=fr}")."""
    match = _ATTRS.search(text)
    if not match:
        return text.strip(), ""
    return text[: match.start()].strip(), match.group(1)
