"""How the polish guard and the audit measure whether a text kept its words.

Case and punctuation are ignored: adding them is exactly what the polish roles
are for, so it must not register as a change in content. The audit measures with
the same functions the guard enforces with.
"""

import re
from difflib import SequenceMatcher

_NON_WORD = re.compile(r"[^\w]+", re.UNICODE)


def norm_words(text: str) -> list[str]:
    return _NON_WORD.sub(" ", text.lower()).split()


def similarity(a: list[str], b: list[str]) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()
