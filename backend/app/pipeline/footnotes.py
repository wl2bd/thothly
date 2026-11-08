"""A page's footnotes as Markdown footnotes, whatever site wrote them.

Every site marks a note the same way underneath: a short mark ("1", "[a]",
"*") linking to an element of the same page, which holds the note and a link
back. Found that way, the calls survive any extractor as a text token, the notes
travel beside the article, and html_to_markdown writes them as "[^fn1]". Pandoc
makes those EPUB footnotes, which e-readers show as popups.
"""

import re
from copy import copy
from urllib.parse import unquote

from bs4 import BeautifulSoup, NavigableString, Tag

# What a call to a note reads as: "1", "[12]", "[a]", "[note 3]", "*", "†".
_MARK = re.compile(r"^\[?\s*(?:note\s*)?(?:\d{1,3}|[a-z]{1,2}|[ivx]{1,5}|[*†‡§¶]{1,3})\s*\]?$", re.I)
# A link back from the note to its call.
_BACKREF_TEXT = re.compile(r"^[\s↩↑^⤴︎︎️]*$")
# The marks that separate two calls ("[1],[2]"), which mean nothing alone.
_SEPARATOR = re.compile(r"^[\s,;.]*$")
# What can hold a note's text.
_CONTAINERS = ["li", "aside", "p", "div", "dd", "section"]
# A note longer than this is not a note: the id is on something bigger.
_MAX_NOTE_CHARS = 4000

TOKEN = re.compile(r"⟦fn(\d+)⟧")
_SECTION_CLASS = "thothly-footnotes"


def _token(n: int) -> str:
    return f"⟦fn{n}⟧"


def lift_footnotes(html: str) -> tuple[str, list[str]]:
    """Replace each note call with a token and take the notes out of the page.

    Returns the page and the notes' HTML, the nth note for token n. The page
    can then go through any extractor: the tokens are plain text.
    """
    if not html or "#" not in html:
        return html, []
    soup = BeautifulSoup(html, "html.parser")
    ids = {el["id"]: el for el in soup.find_all(id=True)}
    calls = [(a, t) for a in soup.find_all("a", href=True) if (t := _note_target(a, ids)) is not None]
    if not calls:
        return html, []

    # The calls' own ids: a link to one of them, inside a note, is its link back.
    call_ids = set()
    for a, _ in calls:
        call_ids.update(el["id"] for el in (a, _call_element(a)) if el.get("id"))

    notes: list[str] = []
    numbers: dict[int, int | None] = {}  # container -> note number (None: empty)
    containers: list[Tag] = []
    for a, target in calls:
        container = _container(target, a)
        if container is None:
            continue
        key = id(container)
        if key not in numbers:
            body = _note_html(container, call_ids)
            numbers[key] = None
            if body:
                notes.append(body)
                numbers[key] = len(notes)
            containers.append(container)
        number = numbers[key]
        call = _call_element(a)
        _drop_separator_before(call)
        call.replace_with(_token(number) if number else "")

    for container in containers:
        parent = container.parent
        if not container.decomposed:
            container.decompose()
        _drop_if_emptied(parent)
    return str(soup), notes


def attach_footnotes(html: str, notes: list[str]) -> str:
    """The article with its notes beside it, for html_to_markdown."""
    if not notes:
        return html
    items = "".join(f'<div data-note="{n}">{note}</div>' for n, note in enumerate(notes, 1))
    return f'{html}<section class="{_SECTION_CLASS}">{items}</section>'


def split_footnotes(soup: BeautifulSoup) -> dict[int, Tag]:
    """Take attach_footnotes' section out of the page: the notes by number."""
    notes: dict[int, Tag] = {}
    for section in soup.find_all("section", class_=_SECTION_CLASS):
        for div in section.find_all("div", attrs={"data-note": True}, recursive=False):
            if div["data-note"].isdigit():
                notes[int(div["data-note"])] = div
        section.extract()
    return notes


def write_footnotes(markdown: str, notes: dict[int, str]) -> str:
    """Tokens become "[^fnN]", followed by the notes that have a call."""
    called: list[int] = []

    def call(match: re.Match) -> str:
        n = int(match.group(1))
        if n not in notes:
            return ""
        if n not in called:
            called.append(n)
        return f"[^fn{n}]"

    body = TOKEN.sub(call, markdown).rstrip()
    if not called:
        return body
    definitions = []
    for n in called:
        lines = notes[n].strip().split("\n")
        indented = [lines[0]] + [f"    {line}" if line.strip() else "" for line in lines[1:]]
        definitions.append(f"[^fn{n}]: " + "\n".join(indented))
    return body + "\n\n" + "\n\n".join(definitions)


_FIRST_DEFINITION = re.compile(r"^\[\^fn\d+\]:", re.M)


def split_definitions(markdown: str) -> tuple[str, str]:
    """The text, and the notes write_footnotes set after it.

    The AI polish gets the text only: the notes are mostly references, would
    cost as much again, and are nothing to punctuate.
    """
    match = _FIRST_DEFINITION.search(markdown)
    if match is None:
        return markdown, ""
    return markdown[: match.start()].rstrip(), markdown[match.start():].strip()


_BOOK_LABEL = re.compile(r"\[\^fn(\d+)\]")


def number_book_footnotes(markdown: str, chapter: int) -> str:
    """Make a chapter's labels its own: the book is one Markdown file."""
    return _BOOK_LABEL.sub(lambda m: f"[^c{chapter}fn{m.group(1)}]", markdown)


def _note_target(a: Tag, ids: dict[str, Tag]) -> Tag | None:
    """The element a note call points at, or None if the link isn't one."""
    fragment = unquote(a["href"].partition("#")[2])
    target = ids.get(fragment) if fragment else None
    if target is None or target is a or not _MARK.match(a.get_text(strip=True)):
        return None
    if a.find_parent("sup") is None and not _named_as_note(a):
        return None
    return target


def _named_as_note(a: Tag) -> bool:
    names = " ".join([*(a.get("class") or []), a.get("role") or "", a.get("id") or ""]).lower()
    return any(word in names for word in ("footnote", "noteref", "fnref", "note-ref"))


def _call_element(a: Tag) -> Tag:
    """The call as the page set it: its <sup> when the link is all it holds."""
    sup = a.find_parent("sup")
    if sup is not None and sup.get_text(strip=True) == a.get_text(strip=True):
        return sup
    return a


def _container(target: Tag, call: Tag) -> Tag | None:
    container = target if target.name in _CONTAINERS else target.find_parent(_CONTAINERS)
    if container is None or call in container.descendants:
        return None
    if len(container.get_text()) > _MAX_NOTE_CHARS:
        return None
    return container


def _note_html(container: Tag, call_ids: set[str]) -> str:
    note = copy(container)
    for a in note.find_all("a", href=True):
        fragment = unquote(a["href"].partition("#")[2])
        classes = " ".join(a.get("class") or []).lower()
        if fragment in call_ids or "backref" in classes or "backlink" in classes or _BACKREF_TEXT.match(a.get_text()):
            a.decompose()
    for el in note.select(".mw-cite-backlink, .footnote-number"):
        el.decompose()
    for text in note.find_all(string=_BACKREF_TEXT):
        if "↩" in text or "↑" in text:
            text.replace_with("")
    if not note.get_text(strip=True) and not note.find("img"):
        return ""
    if note.name in ("li", "dd", "section", "aside"):
        note.name = "div"
    note.attrs = {}
    return str(note)


def _drop_separator_before(call: Tag) -> None:
    """A "," set between two calls goes with them."""
    prev = call.previous_sibling
    while isinstance(prev, NavigableString) and not prev.strip():
        prev = prev.previous_sibling
    if isinstance(prev, Tag) and prev.name == "sup" and _SEPARATOR.match(prev.get_text()) and prev.get_text().strip():
        prev.decompose()


def _drop_if_emptied(el: Tag | None) -> None:
    """The list or box that held the notes, now holding nothing but chrome."""
    while el is not None and el.name not in ("body", "html", "[document]", "article", "main"):
        if any(isinstance(c, Tag) and c.name not in ("hr", "h1", "h2", "h3", "h4", "h5", "h6") for c in el.children):
            return
        if any(isinstance(c, NavigableString) and c.strip() for c in el.children):
            return
        # A heading left alone is the notes' title ("Notes", "Footnotes").
        parent = el.parent
        el.decompose()
        el = parent
