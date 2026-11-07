"""Footnotes: any page's note calls become Markdown footnotes (popups in the EPUB)."""

from app.pipeline.footnotes import attach_footnotes, lift_footnotes, number_book_footnotes
from app.pipeline.html_md import html_to_markdown


def _md(html: str) -> str:
    body, notes = lift_footnotes(html)
    return html_to_markdown(attach_footnotes(body, notes))


def test_static_site_footnotes():
    # Hugo, Jekyll, Python-Markdown, Pandoc all write this shape.
    html = (
        '<p>Zeno taught at the Stoa.<sup id="fnref:1"><a href="#fn:1" class="footnote-ref">1</a></sup></p>'
        '<div class="footnotes" role="doc-endnotes"><hr><ol>'
        '<li id="fn:1"><p>The painted porch. <a href="#fnref:1" class="footnote-backref">↩︎</a></p></li>'
        "</ol></div>"
    )
    md = _md(html)
    assert "Zeno taught at the Stoa.[^fn1]" in md
    assert md.endswith("[^fn1]: The painted porch.")
    assert "↩" not in md and "---" not in md


def test_newsletter_footnotes():
    # Substack's shape: the note's own number links back, the text sits beside it.
    html = (
        '<p>A claim<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a>.</p>'
        '<div class="footnote"><a id="footnote-1" href="#footnote-anchor-1" class="footnote-number">1</a>'
        '<div class="footnote-content"><p>The <em>source</em>.</p></div></div>'
    )
    md = _md(html)
    assert "A claim[^fn1]." in md
    assert "[^fn1]: The *source*." in md


def test_encyclopedia_footnotes_and_separators():
    # Parsoid: page-relative hrefs, bracketed marks, a comma between two calls.
    html = (
        '<p>Stoa<sup class="mw-ref reference" id="cite_ref-1"><a href="./Sto%C3%AFcisme#cite_note-1">'
        '<span>[</span>1<span>]</span></a></sup><sup class="reference cite_virgule">,</sup>'
        '<sup class="mw-ref reference" id="cite_ref-a"><a href="./Sto%C3%AFcisme#cite_note-a">[a]</a></sup>.</p>'
        '<p>Again<sup class="mw-ref reference" id="cite_ref-1b"><a href="./Sto%C3%AFcisme#cite_note-1">[1]</a></sup>.</p>'
        '<div class="mw-references-wrap"><ol class="mw-references">'
        '<li id="cite_note-1"><span class="mw-cite-backlink"><a href="./Sto%C3%AFcisme#cite_ref-1">↑</a></span>'
        ' <span class="mw-reference-text">Diogène Laërce, VII.</span></li>'
        '<li id="cite_note-a"><a href="./Sto%C3%AFcisme#cite_ref-a">↑</a> Le portique.</li>'
        "</ol></div>"
    )
    md = _md(html)
    assert "Stoa[^fn1][^fn2]." in md
    assert "Again[^fn1]." in md  # the same note, called twice
    assert "<sup>" not in md
    assert "[^fn1]: Diogène Laërce, VII." in md
    assert "[^fn2]: Le portique." in md
    assert "↑" not in md


def test_ordinary_links_and_superscripts_stay():
    html = '<p>See <a href="#method">the method</a>, the XIX<sup>e</sup> century, x<sup>2</sup>.</p><h2 id="method">Method</h2>'
    md = _md(html)
    assert "[the method](#method)" in md
    assert "XIX<sup>e</sup>" in md and "x<sup>2</sup>" in md
    assert "[^" not in md


def test_call_with_no_note_text_is_dropped():
    html = '<p>Text<sup><a href="#n1">1</a></sup>.</p><ol><li id="n1"><a href="#x">↩</a></li></ol>'
    assert _md(html) == "Text."


def test_multi_paragraph_note_indents_its_continuation():
    html = (
        '<p>Text<sup><a href="#n1">1</a></sup></p>'
        '<ol><li id="n1"><p>One.</p><p>Two.</p></li></ol>'
    )
    assert _md(html).endswith("[^fn1]: One.\n\n    Two.")


def test_book_numbering_keeps_labels_apart():
    a = "One[^fn1].\n\n[^fn1]: First."
    b = "Two[^fn1].\n\n[^fn1]: Second."
    assert number_book_footnotes(a, 1) == "One[^c1fn1].\n\n[^c1fn1]: First."
    assert number_book_footnotes(b, 2) == "Two[^c2fn1].\n\n[^c2fn1]: Second."
    # A regex class in code is not a footnote.
    assert number_book_footnotes("`[^a-z]`", 1) == "`[^a-z]`"
