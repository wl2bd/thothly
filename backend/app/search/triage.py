"""Search triage: one small-model call judges every result of a search.

Thothly compiles things people READ, so a search hit is only worth showing if it
turns into text: a lecture, an interview, an article. A music video, a trailer or
gameplay with no commentary compiles to nothing. Keyword ranking can't tell them
apart; a model reading title + channel + description + duration can.

The model answers closed questions only (a JSON schema of enums and small
integers), never free text, so its output is checked, not trusted: an unknown
index or a missing field is ignored. Any failure returns the list untouched —
the triage can make a search better, never break it.

Swappable: any OpenAI-compatible endpoint with JSON-schema output (a decision
model like TypeSafe Jev would slot in here once it's reachable).
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
    relevance: int
    format: str
    level: str


class _Verdict(BaseModel):
    freshness: str
    level: str
    results: list[_Judgement]


def triage_enabled() -> bool:
    return bool(settings.search_triage_api_key)


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


def _ask(query: str, results: list[SearchResult]) -> _Verdict:
    endpoint = Endpoint(
        settings.search_triage_base_url, settings.search_triage_model, settings.search_triage_api_key
    )
    lines = "\n".join(_describe(i, r) for i, r in enumerate(results))
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


def _describe(i: int, r: SearchResult) -> str:
    parts = [f"[{i}] {r.type}", r.title]
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

    kept = sorted((i for i, j in judged.items() if j.compilable and j.relevance > 0), key=key)
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

