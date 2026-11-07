"""Rebuild the home page's example compilations (frontend/public/examples).

Each is three Wikipedia articles compiled the way a job compiles them with AI
polish off. Run from
backend/: `uv run python scripts/gen_examples.py`.
Pass a directory to also render each example's EPUB there (for EPUBCheck).
"""

import sys
from pathlib import Path

from app.jobs.chapters import draft
from app.pipeline.compiler import compile_book
from app.render.epub import render_epub
from app.sources.models import DiscoveredItem
from app.sources.wikipedia import article_title

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
        for i, page in enumerate(pages):
            url = f"https://en.wikipedia.org/wiki/{page}"
            item = DiscoveredItem(
                title=article_title(url), url=url, item_type="blog", source_index=0, item_index=i
            )
            chapters.append(draft(item, transcribe=False).chapter)
        book = compile_book(chapters, title)
        (OUT / f"{slug}.md").write_text(book.to_markdown(), encoding="utf-8")
        if epub_dir:
            render_epub(book, epub_dir / f"{slug}.epub")
        print(slug, "ok")


if __name__ == "__main__":
    main()
