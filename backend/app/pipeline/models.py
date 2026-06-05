from datetime import datetime

from pydantic import BaseModel


class CompiledChapter(BaseModel):
    title: str
    source_type: str  # "youtube" | "blog"
    source_url: str
    author: str | None = None
    published_at: datetime | None = None
    content_md: str


class CompiledBook(BaseModel):
    title: str
    generated_at: datetime
    chapters: list[CompiledChapter]

    def to_markdown(self) -> str:
        parts: list[str] = [f"# {self.title}", ""]
        for chapter in self.chapters:
            parts.append(f"## {chapter.title}")

            meta_parts = [f"*Source : [{chapter.source_type}]({chapter.source_url})*"]
            if chapter.author:
                meta_parts.append(f"*Auteur : {chapter.author}*")
            if chapter.published_at:
                meta_parts.append(f"*Date : {chapter.published_at.strftime('%Y-%m-%d')}*")

            parts.append("::: {.source-attribution}")
            parts.append(" | ".join(meta_parts))
            parts.append(":::")
            parts.append("")
            parts.append(chapter.content_md)
            parts.append("")
        return "\n".join(parts)
