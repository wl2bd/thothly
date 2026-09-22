"""Wikipedia is read through its REST HTML; the cleaning decides what of the
page reaches the book."""

from app.sources.wikipedia import clean_wikipedia_html, is_wikipedia_article

PAGE = r"""<html><body>
<section data-mw-section-id="0"><div class="hatnote">For other uses, see X.</div>
<p>Zeno taught at the <a href="./Stoa_Poikile">Stoa</a>.<sup class="mw-ref reference"><a href="#cite_note-1">[1]</a></sup></p>
<figure><a href="./File:Zeno.jpg"><img src="//upload.wikimedia.org/zeno.jpg"></a><figcaption>Zeno</figcaption></figure>
<p>Softmax: <span><math><semantics><annotation>{\displaystyle x}</annotation></semantics></math><img src="//wikimedia.org/math/x.svg"></span></p></section>
<section data-mw-section-id="1"><h2>Sources</h2><p>Diogenes Laertius is our main witness.</p></section>
<section data-mw-section-id="2"><h2>Notes</h2><p>1. A note.</p></section>
<section data-mw-section-id="3"><h2>Fragment collections</h2><p>SVF.</p></section>
<div class="navbox">Philosophy navigation</div>
</body></html>"""


def test_keeps_the_article_and_drops_the_page_furniture():
    html = clean_wikipedia_html(PAGE, "https://en.wikipedia.org/wiki/Stoicism")
    assert "Zeno taught at the" in html
    assert 'href="https://en.wikipedia.org/wiki/Stoa_Poikile"' in html
    assert 'src="https://upload.wikimedia.org/zeno.jpg"' in html and "File:Zeno" not in html
    assert "https://wikimedia.org/math/x.svg" in html and "displaystyle" not in html
    for junk in ("[1]", "For other uses", "Philosophy navigation"):
        assert junk not in html


def test_the_first_appendix_ends_the_article_but_a_sources_section_does_not():
    html = clean_wikipedia_html(PAGE, "https://en.wikipedia.org/wiki/Stoicism")
    assert "Diogenes Laertius" in html  # "Sources" can be real content
    assert "A note" not in html and "SVF" not in html


def test_only_article_pages_take_the_api_path():
    assert is_wikipedia_article("https://fr.wikipedia.org/wiki/Sto%C3%AFcisme")
    assert not is_wikipedia_article("https://en.wikipedia.org/wiki/Talk:Stoicism")
    assert not is_wikipedia_article("https://en.wikipedia.org/w/index.php?title=Stoicism")
    assert not is_wikipedia_article("https://example.com/wiki/Stoicism")

