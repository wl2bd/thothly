"""Rebuild the home page's example compilations (frontend/public/examples).

Each is three Wikipedia articles compiled the way a job compiles articles with
AI polish off (runner._blog_chapter minus the job bookkeeping). Run from
backend/: `uv run python scripts/gen_examples.py`.
Pass a directory to also render each example's EPUB there (for EPUBCheck).
"""

import sys
from pathlib import Path

from app.pipeline.compiler import compile_book, demote_headings, html_to_markdown, strip_leading_title
from app.pipeline.models import CompiledChapter
from app.render.epub import render_epub
from app.sources.blog import scrape_article

EXAMPLES = {
    "stoicism": ("Stoicism", ["Stoicism", "Epictetus", "Marcus_Aurelius"]),
    "how-transformers-work": (
        "How transformers work",
        [
            "Transformer_(deep_learning_architecture)",
            "Attention_(machine_learning)",
            "Large_language_model",
        ],
    ),
}
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples"


def main() -> None:
    epub_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    for slug, (title, pages) in EXAMPLES.items():
        chapters = []
        for page in pages:
            url = f"https://en.wikipedia.org/wiki/{page}"
            article = scrape_article(url)
            content = html_to_markdown(article.content_html)
            chapters.append(CompiledChapter(
                title=article.title,
                source_type="blog",
                source_url=url,
                author=article.author,
                published_at=article.published_at,
                content_md=demote_headings(strip_leading_title(content, article.title)),
                language=article.language,
            ))
        book = compile_book(chapters, title)
        (OUT / f"{slug}.md").write_text(book.to_markdown(), encoding="utf-8")
        if epub_dir:
            render_epub(book, epub_dir / f"{slug}.epub")
        print(slug, "ok")


if __name__ == "__main__":
    main()
