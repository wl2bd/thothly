"""A book from its chapters."""

from datetime import datetime, timezone

from app.pipeline.i18n import dominant_language
from app.pipeline.models import CompiledBook, CompiledChapter


# The title of a book whose sources gave no name.
DEFAULT_BOOK_TITLE = "Thothly compilation"


class CompilationError(Exception):
    pass


def derive_book_title(source_names: list[str | None]) -> str:
    """A meaningful default book title from the source names.

    Uses the actual source name (playlist/channel/feed/site title) rather than
    a generic count, so the EPUB takes the real source name (e.g. a channel or
    blog title) instead of a generic "Thothly - 2 YouTube videos". The user can
    still override it before compiling.
    """
    names = [n.strip() for n in source_names if n and n.strip()]
    if not names:
        return DEFAULT_BOOK_TITLE
    if len(names) == 1:
        return names[0]
    rest = len(names) - 1
    return f"{names[0]} (+{rest} more)"


def compile_book(chapters: list[CompiledChapter], title: str) -> CompiledBook:
    usable = [c for c in chapters if c.content_md and c.content_md.strip()]
    if not usable:
        raise CompilationError(
            "The selected items had no usable content. Check that the videos have "
            "subtitles and the articles have readable text."
        )

    return CompiledBook(
        title=title,
        generated_at=datetime.now(timezone.utc),
        chapters=usable,
        language=dominant_language([(c.language, len(c.content_md)) for c in usable]),
    )
