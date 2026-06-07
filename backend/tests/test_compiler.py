import pytest

from app.pipeline.compiler import (
    CompilationError,
    compile_book,
    demote_headings,
    derive_book_title,
    html_to_markdown,
    is_punctuated,
    segments_to_markdown,
    strip_leading_title,
    transcript_to_markdown,
)
from app.pipeline.models import CompiledChapter
from app.sources.models import Chapter, Transcript, TranscriptSegment


def _seg(text: str, start: float) -> TranscriptSegment:
    return TranscriptSegment(text=text, start_s=start, duration_s=1.0)


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


def test_transcript_to_markdown_structures_by_chapters():
    transcript = Transcript(
        video_id="v", language="fr",
        segments=[
            _seg("intro un", 0.0), _seg("intro deux", 5.0),
            _seg("corps un", 20.0), _seg("corps deux", 25.0),
        ],
        chapters=[
            Chapter(title="Introduction", start_s=0.0, end_s=15.0),
            Chapter(title="Le corps", start_s=15.0, end_s=40.0),
        ],
    )
    md = transcript_to_markdown(transcript)
    assert "### Introduction" in md
    assert "### Le corps" in md
    assert md.index("### Introduction") < md.index("### Le corps")
    assert "intro un intro deux" in md
    assert "corps un corps deux" in md


def test_transcript_to_markdown_without_chapters_is_flat():
    transcript = Transcript(
        video_id="v", language="fr",
        segments=[_seg("a", 0.0), _seg("b", 1.0)], chapters=[],
    )
    md = transcript_to_markdown(transcript)
    assert "###" not in md
    assert "a b" in md


def test_html_to_markdown():
    assert "hello" in html_to_markdown("<p>hello</p>")
    assert html_to_markdown("") == ""


def test_demote_headings_nests_under_chapter_and_keeps_structure():
    md = "# Article Title\n\nIntro.\n\n## A Section\n\nBody."
    out = demote_headings(md)  # floor h3
    assert "### Article Title" in out
    assert "#### A Section" in out  # relative depth preserved (h1->h3, h2->h4)


def test_demote_headings_noop_when_already_deep_enough():
    md = "### Already a subsection\n\ntext"
    assert demote_headings(md) == md


def test_strip_leading_title_removes_duplicate_then_sections_lift():
    md = "# The Pegged Asset Swap Wars\n\nIntro.\n\n## Early Days\n\nbody"
    out = demote_headings(strip_leading_title(md, "The Pegged Asset Swap Wars"))
    assert "Pegged Asset Swap Wars" not in out  # duplicate title gone
    assert "### Early Days" in out  # section lifts from h2 to h3 (in the TOC)


def test_strip_leading_title_matches_despite_site_suffix():
    md = "# My Post | TokenBrice\n\nbody"
    out = strip_leading_title(md, "My Post")
    assert "TokenBrice" not in out
    assert out.strip() == "body"


def test_strip_leading_title_keeps_non_matching_heading():
    md = "## A Real Section\n\nbody"
    assert strip_leading_title(md, "Some Other Title") == md


def test_demote_headings_leaves_code_fences_alone():
    md = "```\n# not a heading\n```\n\n## Real heading"
    out = demote_headings(md)
    assert "# not a heading" in out  # inside fence, untouched
    assert "### Real heading" in out  # real h2 shifted to h3


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
