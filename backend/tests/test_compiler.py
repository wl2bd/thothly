import pytest

from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    derive_book_title,
    html_to_markdown,
    is_punctuated,
    segments_to_markdown,
)
from app.pipeline.models import CompiledChapter


def test_segments_to_markdown_groups_unpunctuated_by_segment_count():
    texts = [str(i) for i in range(20)]
    result = segments_to_markdown(texts, group_size=8)
    assert result.count("\n\n") == 2  # 20 segments / 8 -> 3 paragraphs


def test_segments_to_markdown_ignores_blank_segments():
    assert segments_to_markdown([]) == ""
    assert segments_to_markdown(["", "   "]) == ""


def test_is_punctuated():
    raw = "la qualité d âme appelée foi est la quintessence de cette dernière " * 5
    assert not is_punctuated(raw)
    clean = "La foi est une vertu. Elle libère l'homme. Son œil s'émerveille. " * 5
    assert is_punctuated(clean)
    # a stray mark in an otherwise raw transcript stays below the threshold
    assert not is_punctuated(("mot " * 200) + "fin.")


def test_segments_to_markdown_splits_punctuated_on_sentences():
    # punctuated captions -> breaks land at sentence ends, never mid-sentence
    sentence = "Ceci est une phrase complète et raisonnablement longue. "
    segments = [sentence.strip()] * 30
    result = segments_to_markdown(segments)
    for paragraph in result.split("\n\n"):
        assert paragraph.endswith(".")


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
