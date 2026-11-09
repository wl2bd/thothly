"""Search triage: one small-model call judges every result of a search.

Thothly compiles things people READ, so a search hit is only worth showing if it
turns into text: a lecture, an interview, an article. A music video, a trailer or
gameplay with no commentary compiles to nothing. Keyword ranking can't tell them
apart; a model reading title + channel + description + duration can.

The model answers closed questions only (yes/no, a choice, a score), never
free text, so its output is checked, not trusted: an unknown
index or a missing field is ignored. Any failure returns the list untouched —
the triage can make a search better, never break it.

A decision model on OpenRouter answers those questions natively and returns a
probability per answer. It switches on with an OpenRouter LLM key
(`settings.openrouter_api_key`) and needs no key of its own.
"""

import logging
import time
from datetime import datetime, timezone

from pydantic import BaseModel

from app.core.config import settings
from app.core.posthog import capture_paid_call
from app.search.models import SearchResult

logger = logging.getLogger(__name__)

_TIMEOUT_S = 8.0
# OpenRouter serves TypeSafe's /v1/systemone contract for many decision models.
TYPESAFE_BASE_URL = "https://openrouter.ai/api"
# Below this, a result is off-topic and dropped: "loosely related" is the floor.
# At 0.5, TypeSafe let self-help podcasts through on "how do transformers work"
# (scored 1-2 for sharing "transform" and "work"); measured on four searches,
# 1.0 halves them.
_MIN_RELEVANCE = 1.0
_SNIPPET_CHARS = 240
_LEVELS = ["intro", "intermediate", "expert"]

class _Judgement(BaseModel):
    i: int
    compilable: bool
    # 0-3, a point on the spectrum (1.6 = between "loosely related" and "on topic").
    relevance: float
    format: str
    level: str


class _Verdict(BaseModel):
    freshness: str
    level: str
    results: list[_Judgement]


def triage_enabled() -> bool:
    return bool(settings.openrouter_api_key)


def _ask(query: str, described: list[dict]) -> _Verdict:
    return _ask_typesafe(query, described)


def triage(query: str, results: list[SearchResult]) -> list[SearchResult]:
    """Drop what can't be compiled or is off-topic, then re-order the rest.
    Returns `results` unchanged on any failure."""
    if not results:
        return results
    started = time.monotonic()
    try:
        verdict = _ask(query, [_describe(r) for r in results])
    except Exception as exc:  # noqa: BLE001 — triage must never break a search
        logger.warning("Search triage failed, returning untriaged results: %s", exc)
        return results
    ordered = rank(results, verdict)
    logger.info(
        "Search triage: %d -> %d results in %.1fs", len(results), len(ordered), time.monotonic() - started
    )
    return ordered


# Relevance rungs, written as a spectrum: TypeSafe scores a position between
# the levels rather than picking one.
_RELEVANCE_LEVELS = [
    "off-topic: not about the request at all",
    "loosely related: same broad subject, does not answer the request",
    "on topic: about what was asked",
    "exactly what was asked",
]
_FORMATS = {
    "lecture": "a taught session, talk or conference presentation",
    "interview": "two or more people in conversation, a debate",
    "documentary": "a reported or narrated documentary",
    "explainer": "a short explanation of one thing",
    "news": "coverage of current events",
    "reaction": "someone commenting on other content",
    "article": "written prose on a page",
    "other": "anything else",
}
_LEVEL_CRITERIA = {
    "intro": "assumes no prior knowledge",
    "intermediate": "assumes the basics are known",
    "expert": "assumes the field is known, speaks to practitioners",
}


def _ask_typesafe(query: str, described: list[dict]) -> _Verdict:
    """One call: the request and every result go in as state, and each judgment
    is its own question against them.

    The API answers closed questions in parallel internally, so asking about
    twenty results costs about what asking about one does — the whole list is
    sent once instead of once per result. Questions stay atomic on purpose: one
    judgment each, never "is this compilable AND relevant", so a bad answer is
    visible on the axis it belongs to instead of poisoning a verdict.
    """
    from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

    questions = {
        "freshness": Choice(
            instructions="Does answering this request need recent material?",
            criteria={
                "recent": "news, current events, or a fast-moving topic",
                "any": "history, philosophy, science basics, how-tos — age does not matter",
            },
        ),
        "wanted_level": Choice(
            instructions="What depth does the request ask for?",
            criteria={**_LEVEL_CRITERIA, "any": "the request does not say"},
        ),
    }
    for i in range(len(described)):
        at = f"results[{i}]"
        questions[f"compilable_{i}"] = Noul(
            instructions={
                "question": "Is this mostly continuous speech or prose a reader could learn from?",
                "inspect": at,
            },
            criteria={
                "true": "lecture, talk, interview, debate, documentary, explainer, "
                        "podcast episode, article",
                "false": "music video, song, trailer, teaser, clip compilation, "
                         "gameplay without commentary, ASMR, shopping page",
            },
        )
        questions[f"relevance_{i}"] = Score(
            instructions={"question": "How well does this answer the request?", "inspect": at},
            criteria=_RELEVANCE_LEVELS,
        )
        questions[f"format_{i}"] = Choice(
            instructions={"question": "What format is this?", "inspect": at}, criteria=_FORMATS
        )
        questions[f"level_{i}"] = Choice(
            instructions={"question": "What depth does this assume?", "inspect": at},
            criteria=_LEVEL_CRITERIA,
        )

    with TypeSafeClient(
        api_key=settings.openrouter_api_key,
        base_url=TYPESAFE_BASE_URL,
        timeout=_TIMEOUT_S,
    ) as client:
        answers = client.system_one(
            state={"request": query, "results": described},
            questions=questions,
            model=settings.typesafe_model,
        )
    capture_paid_call(
        "openrouter", "triage", answers.usage.input_tokens * settings.typesafe_price_per_mtok_in / 1e6
    )

    judged = []
    for i in range(len(described)):
        if f"compilable_{i}" not in answers.nouls or f"relevance_{i}" not in answers.scores:
            continue  # unanswered: `rank` leaves it in place rather than dropping it
        judged.append(
            _Judgement(
                i=i,
                # The probability IS the answer: over a half is a yes. It is
                # thresholded once, here, and `rank` drops on the result.
                compilable=answers.nouls[f"compilable_{i}"].noul >= 0.5,
                relevance=answers.scores[f"relevance_{i}"].score,
                format=answers.choices[f"format_{i}"].choice,
                level=answers.choices[f"level_{i}"].choice,
            )
        )
    return _Verdict(
        freshness=answers.choices["freshness"].choice,
        level=answers.choices["wanted_level"].choice,
        results=judged,
    )

def describe(
    kind: str, title: str, author: str | None = None, duration_s: int | None = None
) -> dict:
    """What the judge reads about one candidate. Named fields, not one joined
    line: titles and show names carry their own "|", and a flat line let the
    judge read a show name as part of the title. Measured on four searches,
    this alone halved the off-topic results kept."""
    d: dict = {"kind": kind, "title": title}
    if author:
        d["channel_or_show"] = author
    if duration_s:
        d["minutes"] = round(duration_s / 60)
    return d


def _describe(r: SearchResult) -> dict:
    d = describe(r.type, r.title, r.author, r.duration_s)
    if r.meta.get("genre"):
        d["genre"] = r.meta["genre"]
    date = _published(r)
    if date:
        d["date"] = date.date().isoformat()
    snippet = (r.meta.get("snippet") or "").replace("\n", " ").strip()
    if snippet:
        d["description"] = snippet[:_SNIPPET_CHARS]
    return d


def rank(results: list[SearchResult], verdict: _Verdict) -> list[SearchResult]:
    """Keep compilable, on-topic results; order by relevance, then closeness to
    the wanted level, then (for a "recent" request) newest first. Results the
    model skipped keep their original order after the judged ones."""
    judged: dict[int, _Judgement] = {}
    for j in verdict.results:
        if 0 <= j.i < len(results) and j.i not in judged:
            judged[j.i] = j

    wanted = _LEVELS.index(verdict.level) if verdict.level in _LEVELS else None

    def key(i: int):
        j = judged[i]
        level_gap = abs(_LEVELS.index(j.level) - wanted) if wanted is not None and j.level in _LEVELS else 0
        date = _published(results[i]) if verdict.freshness == "recent" else None
        newest = -date.timestamp() if date else 0  # undated sort after dated
        return (-j.relevance, level_gap, newest, i)

    kept = sorted(
        (i for i, j in judged.items() if j.compilable and j.relevance >= _MIN_RELEVANCE), key=key
    )
    for i in kept:
        results[i].relevance = judged[i].relevance
    skipped = [r for i, r in enumerate(results) if i not in judged]
    return [results[i] for i in kept] + skipped


def _published(r: SearchResult) -> datetime | None:
    raw = r.meta.get("published_at") or r.meta.get("release_date")
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)



# --- Item triage: after a source unfolds into items --------------------------
# A channel, feed or homepage lists everything it holds, music videos and stray
# links included. The same judge sorts them, but it never removes anything: an
# item it doubts starts unchecked at review, with the reason on its row.

# A long feed lists up to hundreds of items; only the first ones start selected
# anyway, so judging past them would cost time for nothing.
MAX_JUDGED_ITEMS = 50

# Without a search behind the source there is no request to be on-topic for,
# so the model is told so and only its "compilable" answer is used.
_NO_REQUEST = "(no request: the user pasted this source; judge only whether each item is compilable)"


def set_aside_reasons(verdict: _Verdict, n: int, *, has_query: bool) -> dict[int, str]:
    """Index -> the short reason an item starts unchecked."""
    reasons: dict[int, str] = {}
    seen: set[int] = set()
    for j in verdict.results:
        if not 0 <= j.i < n or j.i in seen:
            continue
        seen.add(j.i)
        if not j.compilable:
            reasons[j.i] = "Likely nothing to read"
        elif has_query and j.relevance < _MIN_RELEVANCE:
            reasons[j.i] = "Likely off-topic"
    return reasons


def judge_items(query: str | None, items: list[dict]) -> dict[int, str]:
    """Reasons to set items aside, from their `describe`d form; empty on any
    failure (the review then shows every item as before)."""
    if not items:
        return {}
    started = time.monotonic()
    try:
        verdict = _ask(query or _NO_REQUEST, items)
    except Exception as exc:  # noqa: BLE001 — triage must never break discovery
        logger.warning("Item triage failed, nothing set aside: %s", exc)
        return {}
    reasons = set_aside_reasons(verdict, len(items), has_query=bool(query))
    logger.info(
        "Item triage: %d of %d set aside in %.1fs", len(reasons), len(items), time.monotonic() - started
    )
    return reasons
