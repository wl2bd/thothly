"""The audit's second pass: a model reads what the word count can't.

`audit.py` catches a chapter that lost words, kept a sound cue or cut its
paragraphs by length. It cannot see a sentence the polish model invented or a
claim it turned around: both keep the word count and most of the words. So a
chapter the mechanical pass calls clean gets read here, passage by passage,
each edited paragraph next to the stretch of source it came from.

The judge is the search triage's model (`settings.search_triage_model`), fixed
in config and never one of the models being compared, or the audit would
measure the judge. It answers two closed yes/no questions per passage, kept
apart so a flag says which failure it saw.
"""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

from app.core.config import settings
from app.pipeline.llm import _client, extra_body
from app.pipeline.providers import Endpoint

# The same tokens as `audit._words`, with their positions kept so a match in
# the word stream maps back to the source text a reader can check.
_TOKEN = re.compile(r"\w+", re.UNICODE)
# Source words kept either side of the matched span: a paragraph boundary can
# fall a few words off, and the judge must not flag what sits just outside.
_MARGIN = 12
# One call per passage: with every pair in one state, a flagged passage lifted
# its neighbours' scores too. Calls run side by side to keep a chapter quick.
_PARALLEL = 8
_TIMEOUT_S = 30.0
# The thresholds below were measured on a judge that returned a probability
# per answer (two chapters, EN and FR, with a planted sentence and a changed
# figure): a plant was caught, a reversed claim ("is" -> "is not") was not. The
# yes/no judge that replaced it has not been re-measured on those plants.
_FINE = (
    "Allowed: punctuation, capitals, paragraph breaks, removing filler words, "
    "false starts and repetitions, fixing words the transcription misheard."
)


def _passages(source_md: str, output_md: str) -> list[tuple[str, str | None]]:
    """Each output paragraph with the source stretch it matches, or None when
    not one of its words lines up with the source."""
    src = list(_TOKEN.finditer(source_md.lower()))
    # The compiler's source block (`:::`) and headings (the "sections" role
    # writes them on purpose) are not the author's words: nothing to judge.
    paragraphs = [p for p in output_md.split("\n\n")
                  if p.strip() and not p.lstrip().startswith((":::", "#"))]
    out_words: list[str] = []
    bounds: list[tuple[int, int]] = []
    for p in paragraphs:
        words = _TOKEN.findall(p.lower())
        bounds.append((len(out_words), len(out_words) + len(words)))
        out_words += words

    matcher = SequenceMatcher(None, [m.group() for m in src], out_words, autojunk=False)
    src_at: dict[int, int] = {}
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            src_at[b + k] = a + k

    passages = []
    for p, (start, end) in zip(paragraphs, bounds):
        hits = [src_at[i] for i in range(start, end) if i in src_at]
        if not hits:
            passages.append((p, None))
            continue
        first = src[max(min(hits) - _MARGIN, 0)]
        last = src[min(max(hits) + _MARGIN, len(src) - 1)]
        passages.append((p, source_md[first.start():last.end()]))
    return passages


_SYSTEM = f"""You compare an EDITED passage with the ORIGINAL it was edited from.
Answer two questions, each on its own:
- adds: does the edited text state a fact, claim, example or detail that the original does not contain?
- changes: does the edited text say something different from the original: a changed figure, name, date, or a claim weakened, reversed or attributed to someone else?
{_FINE} None of these count as adding or changing."""

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["adds", "changes"],
    "properties": {"adds": {"type": "boolean"}, "changes": {"type": "boolean"}},
}


def judge_endpoint() -> Endpoint | None:
    if not settings.search_triage_api_key:
        return None
    return Endpoint(settings.search_triage_base_url, settings.search_triage_model,
                    settings.search_triage_api_key)


def judge_chapter(source_md: str, output_md: str) -> list[str]:
    """Flags for the passages the judge thinks were invented or distorted."""
    endpoint = judge_endpoint()
    if endpoint is None:
        raise RuntimeError("The judge needs SEARCH_TRIAGE_API_KEY")
    client = _client(endpoint, _TIMEOUT_S)

    passages = _passages(source_md, output_md)
    flags = [f"passage {n + 1} matches nothing in the source"
             for n, (_, src) in enumerate(passages) if src is None]
    todo = [(n, out, src) for n, (out, src) in enumerate(passages) if src is not None]

    def ask(item):
        n, out, src = item
        response = client.chat.completions.create(
            model=endpoint.model,
            temperature=0,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": f"ORIGINAL:\n{src}\n\nEDITED:\n{out}"},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "judge", "strict": True, "schema": _SCHEMA},
            },
            extra_body=extra_body(endpoint),
        )
        answer = json.loads(response.choices[0].message.content or "{}")
        return n, out, bool(answer.get("adds")), bool(answer.get("changes"))

    with ThreadPoolExecutor(_PARALLEL) as pool:
        for n, out, adds, changes in pool.map(ask, todo):
            seen = [label for label, hit in (("adds content", adds), ("changes the meaning", changes)) if hit]
            if seen:
                flags.append(f"passage {n + 1} {' and '.join(seen)}: \"{out[:80].strip()}…\"")
    return flags
