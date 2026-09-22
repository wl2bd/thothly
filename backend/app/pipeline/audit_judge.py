"""The audit's second pass: a model reads what the word count can't.

`audit.py` catches a chapter that lost words, kept a sound cue or cut its
paragraphs by length. It cannot see a sentence the polish model invented or a
claim it turned around: both keep the word count and most of the words. So a
chapter the mechanical pass calls clean gets read here, passage by passage,
each edited paragraph next to the stretch of source it came from.

The judge is TypeSafe (`settings.typesafe_model`), fixed in config and never
one of the models being compared, or the audit would measure the judge. It
answers two closed questions per passage, kept apart so a flag says which
failure it saw.
"""

import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

from app.core.config import settings

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
# Probability of a yes above which a passage is flagged, per question. Measured
# on two chapters (EN, FR) with a planted sentence and a changed figure: "adds"
# scored 0.76-0.99 on the plants and at most 0.19 on intact passages; "changes"
# scored 0.96 on the plants but up to 0.73 on intact ones, hence its high bar.
# A reversed claim ("is" -> "is not") scored under 0.5 and is NOT caught.
ADDS_AT = 0.5
CHANGES_AT = 0.9

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


def judge_chapter(source_md: str, output_md: str) -> list[str]:
    """Flags for the passages the judge thinks were invented or distorted."""
    from typesafe_sdk import Noul, TypeSafeClient

    passages = _passages(source_md, output_md)
    flags = [f"passage {n + 1} matches nothing in the source"
             for n, (_, src) in enumerate(passages) if src is None]
    todo = [(n, out, src) for n, (out, src) in enumerate(passages) if src is not None]

    questions = {
        "adds": Noul(
            instructions="Does the edited text state a fact, claim, example or detail that the original does not contain?",
            criteria={
                "true": "something in the edited text has no counterpart in the original",
                "false": f"everything in it comes from the original. {_FINE}",
            },
        ),
        "changes": Noul(
            instructions="Does the edited text say something different from what the original says: "
                         "a changed figure, name, date, or a claim weakened, reversed or attributed to someone else?",
            criteria={
                "true": "a reader of the edited text would believe something the original does not say",
                "false": f"the meaning is the same. {_FINE}",
            },
        ),
    }
    def ask(item):
        n, out, src = item
        answers = client.system_one(
            state={"original": src, "edited": out}, questions=questions, model=settings.typesafe_model
        )
        return n, out, answers.nouls["adds"].noul, answers.nouls["changes"].noul

    with TypeSafeClient(
        api_key=settings.typesafe_api_key, base_url=settings.typesafe_base_url, timeout=_TIMEOUT_S
    ) as client, ThreadPoolExecutor(_PARALLEL) as pool:
        for n, out, adds, changes in pool.map(ask, todo):
            seen = [label for label, hit in (("adds content", adds >= ADDS_AT),
                                             ("changes the meaning", changes >= CHANGES_AT)) if hit]
            if seen:
                flags.append(f"passage {n + 1} {' and '.join(seen)}: \"{out[:80].strip()}…\"")
    return flags
