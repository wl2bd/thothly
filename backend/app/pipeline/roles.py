"""LLM role registry.

A *role* is one faithful transform pass applied at compile time. Roles are
data here (id/label/description/scope + system prompt) so the same definitions
drive both the cleanup engine (`cleanup.py`) and the `GET /llm` catalogue the
review screen renders. Adding a role is: append a `Role` and teach `cleanup.py`
how to apply it.

All prompts insist on preserving the original language and not
adding/removing/summarising content (except `preface`, which is generative).
"""

from dataclasses import dataclass

# Role ids — stable identifiers stored on the job and sent by the frontend.
PUNCTUATE = "punctuate"
COPYEDIT = "copyedit"
SECTIONS = "sections"
PREFACE = "preface"


@dataclass(frozen=True)
class Role:
    id: str
    label: str
    description: str
    scope: str  # "item" (per chapter) | "book" (once, on the whole book)
    # How the review screen surfaces the role:
    #   "auto"    — always applied when needed, never a user choice (punctuation
    #               on raw captions); shown only for transparency, not toggled.
    #   "default" — the safe set the master "AI polish" switch turns on.
    #   "extra"   — opinionated passes (invent structure / generate text) kept
    #               behind a "Customize" disclosure, opt-in one by one.
    tier: str
    system_prompt: str


_PUNCTUATE_PROMPT = (
    "You are a transcript editor. You are given the raw text of an automatic "
    "transcription (subtitles) with no punctuation or capitalization. Restore "
    "punctuation and capitalization, and break the text into readable "
    "paragraphs. Do not summarize, add, or remove any content: keep every word "
    "and its order. Keep the original language (do not translate). Reply only "
    "with the corrected text in Markdown (paragraphs separated by a blank line), "
    "with no commentary."
)

_COPYEDIT_PROMPT = (
    "You are a copy editor. You are given an already-punctuated text. Remove "
    "filler words and hesitations (uh, um, you know, repeated false starts), fix "
    "obvious speech-recognition errors, and lightly improve the flow — without "
    "changing the meaning, summarizing, or adding ideas. Keep the original "
    "language (do not translate), the paragraph structure, and all existing "
    "Markdown formatting (bold **, italics *, links [text](url), lists, tables). "
    "Reply only with the corrected text in Markdown, with no commentary."
)

def _sections_prompt(language_clause: str) -> str:
    return (
        "You are an editor. You are given a continuous text (a transcript or "
        "article). Insert level-2 Markdown section headings (## Title) wherever "
        "the topic changes, to structure the reading. Do not add, remove, or "
        "rephrase any content other than these headings. The headings must be "
        f"short and {language_clause}. Reply only with the structured text in "
        "Markdown, with no commentary."
    )


# Default (generic) sections prompt: used for articles and the role catalogue,
# where no reliable language tag is on hand, so the model infers it from the text.
_SECTIONS_PROMPT = _sections_prompt("in the language of the text (do not translate)")


# English names for the language tags transcripts carry, so the sections prompt
# can name the target language outright rather than trust the model to infer it
# from a chunk (a weak model otherwise drifts to English). Falls back to the raw
# tag for anything unlisted.
_LANGUAGE_NAMES = {
    "en": "English", "fr": "French", "es": "Spanish", "de": "German",
    "it": "Italian", "pt": "Portuguese", "nl": "Dutch", "ru": "Russian",
    "ja": "Japanese", "zh": "Chinese", "ar": "Arabic", "ko": "Korean",
    "pl": "Polish", "tr": "Turkish", "sv": "Swedish", "uk": "Ukrainian",
    "ro": "Romanian", "el": "Greek", "cs": "Czech", "hu": "Hungarian",
}


def language_name(tag: str | None) -> str | None:
    """Map a transcript language tag (`fr`, `fr-FR`) to an English language name.
    None/blank/unknown → None, so callers keep the generic 'language of the
    text' instruction rather than name a language they aren't sure of."""
    if not tag:
        return None
    base = tag.split("-")[0].strip().lower()
    return _LANGUAGE_NAMES.get(base)


def sections_prompt(language: str | None) -> str:
    """The `sections` system prompt, pinned to an explicit language when the
    transcript's language is known so generated headings can't drift to English;
    otherwise the generic, infer-from-text prompt."""
    name = language_name(language)
    if not name:
        return _SECTIONS_PROMPT
    return _sections_prompt(f"in {name}, the language of the transcript (do not translate)")

_PREFACE_PROMPT = (
    "You are the editor of a reading collection. You are given the book's title "
    "and the list of its chapters. Write a short preface (2 to 4 paragraphs) "
    "that introduces the collection and what the reader will find in it. Write "
    "in English, in a sober, editorial tone. Reply only with the preface text in "
    "Markdown, with no title or commentary."
)


# Order matters for item-scoped roles: punctuate first (creates sentences),
# then copyedit (cleans them), then sections (adds structure on top).
ROLES: list[Role] = [
    Role(
        id=PUNCTUATE,
        label="Punctuation",
        description=(
            "Restores punctuation and paragraphs to raw, unpunctuated "
            "transcripts. Runs automatically whenever a source needs it."
        ),
        scope="item",
        tier="auto",
        system_prompt=_PUNCTUATE_PROMPT,
    ),
    Role(
        id=COPYEDIT,
        label="Copyedit",
        description=(
            "Tidies filler words and small transcription slips, without "
            "changing the meaning."
        ),
        scope="item",
        tier="default",
        system_prompt=_COPYEDIT_PROMPT,
    ),
    Role(
        id=SECTIONS,
        label="Sections",
        description=(
            "Adds section headings to long, unstructured sources, for a "
            "cleaner table of contents."
        ),
        scope="item",
        tier="extra",
        system_prompt=_SECTIONS_PROMPT,
    ),
    Role(
        id=PREFACE,
        label="Preface",
        description="Generates a short preface to open the compilation.",
        scope="book",
        tier="extra",
        system_prompt=_PREFACE_PROMPT,
    ),
]

_BY_ID = {role.id: role for role in ROLES}


def get_role(role_id: str) -> Role | None:
    return _BY_ID.get(role_id)


def selected_item_roles(role_ids: list[str]) -> list[Role]:
    """Item-scoped roles among the selection, in canonical apply order."""
    chosen = set(role_ids)
    return [r for r in ROLES if r.scope == "item" and r.id in chosen]


def has_role(role_ids: list[str], role_id: str) -> bool:
    return role_id in set(role_ids)
