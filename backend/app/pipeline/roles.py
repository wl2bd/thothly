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

_SECTIONS_PROMPT = (
    "You are an editor. You are given a continuous text (a transcript or "
    "article). Insert level-2 Markdown section headings (## Title) wherever the "
    "topic changes, to structure the reading. Do not add, remove, or rephrase "
    "any content other than these headings. The headings must be short and in "
    "the language of the text (do not translate). Reply only with the structured "
    "text in Markdown, with no commentary."
)

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
            "Restores punctuation and paragraphs to unpunctuated transcripts. "
            "Only acts on videos flagged “to clean up”."
        ),
        scope="item",
        system_prompt=_PUNCTUATE_PROMPT,
    ),
    Role(
        id=COPYEDIT,
        label="Copyedit",
        description=(
            "Removes filler words and fixes speech-recognition errors, without "
            "changing the meaning."
        ),
        scope="item",
        system_prompt=_COPYEDIT_PROMPT,
    ),
    Role(
        id=SECTIONS,
        label="Sections",
        description=(
            "Adds section headings to content with no structure (videos without "
            "chapters), for a better table of contents."
        ),
        scope="item",
        system_prompt=_SECTIONS_PROMPT,
    ),
    Role(
        id=PREFACE,
        label="Preface",
        description="Generates a short preface to open the book.",
        scope="book",
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
