from app.render.epub import _inject_bodymatter

_NAV = """<nav epub:type="toc" role="doc-toc" id="toc"><h1>TOC</h1><ol>\
<li><a href="text/ch001.xhtml#sources">Sources</a></li></ol></nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
  <ol>
    <li><a href="text/title_page.xhtml" epub:type="titlepage">Title Page</a></li>
    <li><a href="#toc" epub:type="toc">Table of Contents</a></li>
  </ol>
</nav>"""


def test_inject_adds_bodymatter_pointing_at_first_toc_link():
    out = _inject_bodymatter(_NAV)
    assert 'epub:type="bodymatter"' in out
    assert 'href="text/ch001.xhtml#sources" epub:type="bodymatter"' in out


def test_inject_is_idempotent():
    once = _inject_bodymatter(_NAV)
    assert _inject_bodymatter(once) == once


def test_inject_noop_without_landmarks_nav():
    no_landmarks = '<nav epub:type="toc"><ol><li><a href="a.xhtml">A</a></li></ol></nav>'
    assert _inject_bodymatter(no_landmarks) == no_landmarks
