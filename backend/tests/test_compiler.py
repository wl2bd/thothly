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
    assert "## Introduction" in md
    assert "## Le corps" in md
    assert md.index("## Introduction") < md.index("## Le corps")
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
    out = demote_headings(md)  # floor h2 (chapter is h1)
    assert "## Article Title" in out
    assert "### A Section" in out  # relative depth preserved (h1->h2, h2->h3)


def test_demote_headings_noop_when_already_deep_enough():
    md = "## Already under the chapter\n\ntext"
    assert demote_headings(md) == md


def test_strip_leading_title_removes_duplicate_then_sections_lift():
    md = "# The Pegged Asset Swap Wars\n\nIntro.\n\n## Early Days\n\nbody"
    out = demote_headings(strip_leading_title(md, "The Pegged Asset Swap Wars"))
    assert "Pegged Asset Swap Wars" not in out  # duplicate title gone
    assert "## Early Days" in out  # section stays h2, just under the chapter h1


def test_strip_leading_title_matches_despite_site_suffix():
    md = "# My Post | QuillNotes\n\nbody"
    out = strip_leading_title(md, "My Post")
    assert "QuillNotes" not in out
    assert out.strip() == "body"


def test_strip_leading_title_keeps_non_matching_heading():
    md = "## A Real Section\n\nbody"
    assert strip_leading_title(md, "Some Other Title") == md


def test_demote_headings_leaves_code_fences_alone():
    md = "```\n# not a heading\n```\n\n# Real heading"
    out = demote_headings(md)
    assert "# not a heading" in out  # inside fence, untouched
    assert "## Real heading" in out  # real h1 shifted to h2


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
    assert "My Book" not in md  # title lives in EPUB metadata, not the body
    assert "# Sources" in md  # opening index page
    assert "# A" in md  # chapter is the top-level (H1) heading
    assert ".source-attribution" in md
    assert "body" in md


def test_compiled_book_sources_page_lists_every_source():
    book = compile_book(
        [
            CompiledChapter(title="A", source_type="blog", source_url="https://a.test", content_md="x"),
            CompiledChapter(title="B", source_type="youtube", source_url="https://b.test", content_md="y"),
        ],
        "Title",
    )
    md = book.to_markdown()
    sources_section = md.split("# A")[0]  # everything before the first chapter
    assert "# Sources" in sources_section
    assert "[A](https://a.test)" in sources_section
    assert "[B](https://b.test)" in sources_section


def test_derive_book_title():
    assert derive_book_title([]) == "Thothly compilation"
    assert derive_book_title([None, None]) == "Thothly compilation"
    assert derive_book_title(["Récits théologiques"]) == "Récits théologiques"
    assert derive_book_title(["X", "Y"]) == "X (+1 more)"
    assert derive_book_title(["X", "Y", "Z"]) == "X (+2 more)"
    # None entries are ignored, real names kept
    assert derive_book_title([None, "QuillNotes"]) == "QuillNotes"


def test_strip_leading_title_handles_a_linked_title_and_its_category_line():
    # A Hugo theme: cover image, a category link, then the title as a link.
    md = (
        "![Pharos](https://x.test/cover.png)\n\n"
        "[Projects](https://x.test/categories/projects/)\n\n"
        "# [Pharos: Free Stablecoin Monitor](https://x.test/pharos/)\n\n"
        "Stablecoins are everywhere."
    )
    out = strip_leading_title(md, "Pharos: Free Stablecoin Monitor")
    assert out == "![Pharos](https://x.test/cover.png)\n\nStablecoins are everywhere."


def test_strip_leading_title_keeps_a_linked_heading_that_is_not_the_title():
    md = "# [Another story](https://x.test/other)\n\nText."
    assert strip_leading_title(md, "Pharos") == md


def test_a_link_with_parentheses_keeps_its_whole_url():
    html = '<p>See <a href="https://en.wikipedia.org/wiki/Naturalism_(philosophy)">naturalism</a>.</p>'
    md = html_to_markdown(html)
    assert "(https://en.wikipedia.org/wiki/Naturalism_%28philosophy%29)" in md


def test_a_wikipedia_table_keeps_its_header_and_drops_its_caption_row():
    # Wikipedia sets a table's title as a first row of one cell spanning the
    # grid (often with a wrong colspan), then the real <th> row, and footnote
    # markers inside cells.
    html = (
        '<table class="wikitable"><tbody>'
        '<tr><th colspan="3"><p>Logical connectives</p></th></tr>'
        '<tr><th>Name<sup class="citation"><a href="#endnote_D">[d]</a></sup></th><th>Example</th></tr>'
        "<tr><td>Conditional</td><td><b>if</b> it is day, it is light</td></tr>"
        "<tr><td>Disjunction</td><td>day | night</td></tr>"
        "</tbody></table>"
    )
    assert html_to_markdown(html) == (
        "**Logical connectives**\n\n"
        "| Name | Example |\n"
        "| --- | --- |\n"
        "| Conditional | **if** it is day, it is light |\n"
        "| Disjunction | day \\| night |"
    )


def test_a_caption_element_and_spans_keep_every_row_the_same_width():
    html = (
        "<table><caption>Scores</caption>"
        "<tr><th>Team</th><th>Q1</th><th>Q2</th></tr>"
        '<tr><td rowspan="2">Reds</td><td>1</td><td>2</td></tr>'
        '<tr><td colspan="2">forfeit</td></tr>'
        "</table>"
    )
    assert html_to_markdown(html) == (
        "**Scores**\n\n"
        "| Team | Q1 | Q2 |\n"
        "| --- | --- | --- |\n"
        "| Reds | 1 | 2 |\n"
        "|  | forfeit |  |"
    )


def test_a_table_holding_a_table_gives_way_to_its_content():
    html = (
        "<table><tr><td><p>Fig 1. Encoder</p></td><td>"
        "<table><tr><th>Label</th><th>Description</th></tr>"
        "<tr><td>h</td><td>hidden vector</td></tr></table>"
        "</td></tr></table>"
    )
    out = html_to_markdown(html)
    assert "Fig 1. Encoder" in out
    assert "| Label | Description |\n| --- | --- |\n| h | hidden vector |" in out
    assert "| Fig 1" not in out


def test_a_single_column_table_is_just_its_text():
    html = "<table><tr><td><ul><li>(1) = 1st spouse</li></ul></td></tr></table>"
    assert html_to_markdown(html) == "- (1) = 1st spouse"
