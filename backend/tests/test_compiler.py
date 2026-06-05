import pytest

from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    derive_book_title,
    html_to_markdown,
    segments_to_markdown,
)
from app.pipeline.models import CompiledChapter


def test_segments_to_markdown_groups_into_paragraphs():
    texts = [str(i) for i in range(20)]
    result = segments_to_markdown(texts, group_size=8)
    assert result.count("\n\n") == 2  # 20 segments / 8 -> 3 paragraphs


def test_segments_to_markdown_ignores_blank_segments():
    assert segments_to_markdown([]) == ""
    assert segments_to_markdown(["", "   "]) == ""


def test_html_to_markdown():
    assert "hello" in html_to_markdown("<p>hello</p>")
    assert html_to_markdown("") == ""


def test_compile_book_raises_when_no_usable_content():
    chapters = [CompiledChapter(title="x", source_type="blog", source_url="u", content_md="   ")]
    with pytest.raises(CompilationError):
        compile_book(chapters, "Title")


def test_compile_book_keeps_only_usable_chapters():
    book = compile_book(
        [
            CompiledChapter(title="A", source_type="blog", source_url="u1", content_md="hi"),
            CompiledChapter(title="B", source_type="blog", source_url="u2", content_md="  "),
        ],
        "Title",
    )
    assert len(book.chapters) == 1
    assert book.title == "Title"


def test_compiled_book_to_markdown_includes_attribution():
    book = compile_book(
        [CompiledChapter(title="A", source_type="youtube", source_url="https://x", content_md="body")],
        "My Book",
    )
    md = book.to_markdown()
    assert "# My Book" in md
    assert "## A" in md
    assert ".source-attribution" in md
    assert "body" in md


def test_derive_book_title():
    assert derive_book_title([]) == "Thothly Compilation"
    assert derive_book_title(["X"]) == "Thothly — X"
    assert "+1 other" in derive_book_title(["X", "Y"])
    assert "+2 others" in derive_book_title(["X", "Y", "Z"])
