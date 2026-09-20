"""Search triage: one small-model call judges every result of a search.

Thothly compiles things people READ, so a search hit is only worth showing if it
turns into text: a lecture, an interview, an article. A music video, a trailer or
gameplay with no commentary compiles to nothing. Keyword ranking can't tell them
apart; a model reading title + channel + description + duration can.

The model answers closed questions only (a JSON schema of enums and small
integers), never free text, so its output is checked, not trusted: an unknown
index or a missing field is ignored. Any failure returns the list untouched —
the triage can make a search better, never break it.

Two backends answer those questions, behind one `_Verdict`:

  TYPESAFE (preferred) — a System One model answers the closed questions
  natively and returns a probability per answer. One call per result, fired in
  parallel, because the API judges one state at a time.

  OPENAI-COMPATIBLE (fallback) — any endpoint with JSON-schema output judges the
  whole list in a single call. Kept so the two can be compared on one search.
"""

import logging
import time
from datetime import datetime, timezone

from pydantic import BaseModel

from app.core.config import settings
from app.pipeline.llm import _client
from app.pipeline.providers import Endpoint
from app.search.models import SearchResult

logger = logging.getLogger(__name__)

_TIMEOUT_S = 8.0
# Below this, a result is off-topic and dropped. Integer relevance 0 falls under
# it and 1 clears it, so the OpenAI path keeps the behaviour it always had.
_MIN_RELEVANCE = 0.5
_SNIPPET_CHARS = 240
_LEVELS = ["intro", "intermediate", "expert"]

_SYSTEM = """You sort search results for Thothly, an app that turns videos, podcasts and web articles into a book to read.

First read the user's REQUEST and decide:
- freshness: "recent" if the request is about news, current events or a fast-moving topic; otherwise "any" (history, philosophy, science basics, how-tos).
- level: the depth the request asks for ("intro", "intermediate", "expert"), or "any" when it doesn't say.

Then judge EVERY result by its index i:
- compilable: true if the item is mostly continuous speech or prose a reader could learn from (lecture, talk, interview, debate, documentary, podcast episode, explainer, article). false for music videos, songs, trailers, teasers, compilations of clips, gameplay without commentary, ASMR, livestream replays of mostly silence, shopping pages.
- relevance: 0 = off-topic, 1 = loosely related, 2 = on topic, 3 = exactly what was asked.
- format: one of lecture, interview, documentary, explainer, news, reaction, article, other.
- level: "intro", "intermediate" or "expert".

Judge from the title, channel/site, duration, date and description only. Do not guess beyond them."""

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["freshness", "level", "results"],
    "properties": {
        "freshness": {"type": "string", "enum": ["recent", "any"]},
        "level": {"type": "string", "enum": [*_LEVELS, "any"]},
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["i", "compilable", "relevance", "format", "level"],
                "properties": {
                    "i": {"type": "integer"},
                    "compilable": {"type": "boolean"},
                    "relevance": {"type": "integer", "enum": [0, 1, 2, 3]},
                    "format": {
                        "type": "string",
                        "enum": ["lecture", "interview", "documentary", "explainer",
                                 "news", "reaction", "article", "other"],
                    },
                    "level": {"type": "string", "enum": _LEVELS},
                },
            },
        },
    },
}


class _Judgement(BaseModel):
    i: int
    compilable: bool
    # 0-3. An integer on the OpenAI path, a point on the spectrum on the
    # TypeSafe one (1.6 = between "loosely related" and "on topic").
    relevance: float
    format: str
    level: str


class _Verdict(BaseModel):
    freshness: str
    level: str
    results: list[_Judgement]


def triage_enabled() -> bool:
    return bool(settings.typesafe_api_key or settings.search_triage_api_key)


def _ask(query: str, results: list[SearchResult]) -> _Verdict:
    if settings.typesafe_api_key:
        return _ask_typesafe(query, results)
    return _ask_openai(query, results)


def triage(query: str, results: list[SearchResult]) -> list[SearchResult]:
    """Drop what can't be compiled or is off-topic, then re-order the rest.
    Returns `results` unchanged on any failure."""
    if not results:
        return results
    started = time.monotonic()
    try:
        verdict = _ask(query, results)
    except Exception as exc:  # noqa: BLE001 — triage must never break a search
        logger.warning("Search triage failed, returning untriaged results: %s", exc)
        return results
    ordered = rank(results, verdict)
    logger.info(
        "Search triage: %d -> %d results in %.1fs", len(results), len(ordered), time.monotonic() - started
    )
    return ordered


# The same rungs the OpenAI schema offers, written as a spectrum: TypeSafe
# scores a position between the levels rather than picking one.
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


def _ask_typesafe(query: str, results: list[SearchResult]) -> _Verdict:
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
    for i in range(len(results)):
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
        api_key=settings.typesafe_api_key,
        base_url=settings.typesafe_base_url,
        timeout=_TIMEOUT_S,
    ) as client:
        answers = client.system_one(
            state={"request": query, "results": [_describe(r) for r in results]},
            questions=questions,
            model=settings.typesafe_model,
        )

    judged = []
    for i in range(len(results)):
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

def _ask_openai(query: str, results: list[SearchResult]) -> _Verdict:
    endpoint = Endpoint(
        settings.search_triage_base_url, settings.search_triage_model, settings.search_triage_api_key
    )
    lines = "\n".join(f"[{i}] {_describe(r)}" for i, r in enumerate(results))
    response = _client(endpoint, _TIMEOUT_S, max_retries=0).chat.completions.create(
        model=endpoint.model,
        temperature=0,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": f"REQUEST: {query}\n\nRESULTS:\n{lines}"},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "triage", "strict": True, "schema": _SCHEMA},
        },
    )
    return _Verdict.model_validate_json(response.choices[0].message.content or "")


def _describe(r: SearchResult) -> str:
    parts = [r.type, r.title]
    if r.author:
        parts.append(f"by {r.author}")
    if r.duration_s:
        parts.append(f"{round(r.duration_s / 60)} min")
    date = _published(r)
    if date:
        parts.append(date.date().isoformat())
    snippet = (r.meta.get("snippet") or "").replace("\n", " ").strip()
    if snippet:
        parts.append(f"— {snippet[:_SNIPPET_CHARS]}")
    return " | ".join(parts)


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
        results[i].meta["format"] = judged[i].format
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

