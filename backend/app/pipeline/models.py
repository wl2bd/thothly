from datetime import datetime

from pydantic import BaseModel

from app.pipeline.i18n import FALLBACK, chrome


class CompiledChapter(BaseModel):
    title: str
    source_type: str  # "youtube" | "blog"
    source_url: str
    author: str | None = None
    published_at: datetime | None = None
    content_md: str
    # YouTube only: the channel page URL, used to source the cover avatar emblem
    # when every chapter comes from one channel.
    channel_url: str | None = None
    # The language the chapter's text is in ("fr"), None when unknown.
    language: str | None = None


class CompiledBook(BaseModel):
    title: str
    generated_at: datetime
    chapters: list[CompiledChapter]
    # Optional LLM-generated opening preface (the `preface` role). Front matter,
    # so it is rendered before the chapters and carries no source attribution.
    preface: str | None = None
    # The dominant content language: the EPUB's declared language, and the
    # language of the chrome written here (Sources, Preface, labels).
    language: str = FALLBACK

    def to_markdown(self) -> str:
        # No book-level heading: Pandoc already builds a title page from the
        # EPUB metadata, so emitting the title here too would show it twice
        # (title page + a redundant TOC root). Chapters are the top-level
        # headings (H1); their inner sections are H2/H3 beneath them.
        # Front matter is marked by a class, not recognised by its (now
        # localized) heading, so readers of this Markdown can skip it in any
        # language; each chapter heading carries its own language.
        labels = chrome(self.language)
        parts: list[str] = []

        # An opening "Sources" page: a clickable index of every source, so the
        # whole reading list is reachable from one place at the front.
        if self.chapters:
            parts.append(f"# {labels['sources']} {{.front-matter}}")
            parts.append("")
            for chapter in self.chapters:
                parts.append(f"- [{chapter.title}]({chapter.source_url})")
            parts.append("")

        # The generated preface opens the book, as its own front-matter heading.
        if self.preface and self.preface.strip():
            parts.append(f"# {labels['preface']} {{.front-matter}}")
            parts.append("")
            parts.append(self.preface.strip())
            parts.append("")

        for chapter in self.chapters:
            lang = f" {{lang={chapter.language}}}" if chapter.language else ""
            parts.append(f"# {chapter.title}{lang}")

            # Show the actual source URL as a clickable link so each chapter is
            # traceable back to (and re-openable from) its origin.
            meta_parts = [f"*{labels['source']}: [{chapter.source_url}]({chapter.source_url})*"]
            if chapter.author:
                meta_parts.append(f"*{labels['author']}: {chapter.author}*")
            if chapter.published_at:
                meta_parts.append(f"*{labels['date']}: {chapter.published_at.strftime('%Y-%m-%d')}*")

            # The labels are the book's chrome: inside a chapter in another
            # language they keep the book's, so they're read in the right voice.
            attribution_lang = (
                f" lang={self.language}"
                if chapter.language and chapter.language != self.language
                else ""
            )
            parts.append(f"::: {{.source-attribution{attribution_lang}}}")
            parts.append(" | ".join(meta_parts))
            parts.append(":::")
            parts.append("")
            parts.append(chapter.content_md)
            parts.append("")
        return "\n".join(parts)
