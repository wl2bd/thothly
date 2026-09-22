"""Wikipedia articles through Wikimedia's REST API, not the rendered page.

trafilatura reads the rendered page badly: a sentence breaks into a new
paragraph at every link, Greek and Latin terms vanish, and the text carries
"[edit]" links, 115 footnote markers and a quarter of back matter (notes,
references, external links) on "Stoicism". The REST API serves the article's
own clean HTML (Parsoid), where each of those is a tagged element to remove.
"""

import re
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

from app.sources.models import Article

# Wikimedia asks API clients to identify themselves with a contact.
_UA = "Thothly/1.0 (https://github.com/wl2bd/thothly)"
_ARTICLE = re.compile(r"^/wiki/([^:]+)$")  # no namespace: Talk:, File:, Special:…

# Everything that is the page's furniture, not the article's text.
_DROP = (
    "sup.mw-ref, .mw-references-wrap, .reflist, .navbox, .navbox-styles, .infobox, "
    ".sidebar, .vertical-navbox, .hatnote, .ambox, .metadata, .noprint, "
    ".shortdescription, .mw-empty-elt, style, link, "
    # A formula comes as MathML (its LaTeX leaks as raw text) plus a rendered
    # image of it: the image is what a reader can use.
    "math"
)

# Appendix section titles (MOS:ORDER puts them last), in the languages Thothly
# meets most. The first one found ends the article, so a title that can also
# head real content stays out: French "Stoïcisme" opens on a "Sources" section
# about the ancient texts, and English puts "Sources" after "Notes" anyway.
_BACK_MATTER = {
    # en
    "see also", "notes", "references", "citations", "bibliography",
    "further reading", "external links", "footnotes", "works cited",
    # fr
    "voir aussi", "notes et références", "références", "bibliographie",
    "liens externes", "articles connexes", "annexes",
    # es
    "véase también", "referencias", "notas", "bibliografía", "enlaces externos",
    # de
    "siehe auch", "literatur", "weblinks", "einzelnachweise", "anmerkungen",
    # it
    "voci correlate", "note", "bibliografia", "collegamenti esterni", "altri progetti",
}


def is_wikipedia_article(url: str) -> bool:
    parts = urlsplit(url)
    return (parts.hostname or "").endswith(".wikipedia.org") and bool(_ARTICLE.match(parts.path))


def article_title(url: str) -> str:
    """"Stoicism", not the page's "Stoicism - Wikipedia"."""
    return unquote(_ARTICLE.match(urlsplit(url).path).group(1)).replace("_", " ")


def scrape_wikipedia(url: str, timeout: float) -> Article:
    parts = urlsplit(url)
    host = (parts.hostname or "").replace(".m.wikipedia.org", ".wikipedia.org")
    title = _ARTICLE.match(parts.path).group(1)
    api = f"https://{host}/w/rest.php/v1/page/{title}/html"
    with urlopen(Request(api, headers={"User-Agent": _UA}), timeout=timeout) as response:
        html = response.read().decode("utf-8")
    return Article(
        url=url,
        title=article_title(url),
        published_at=None,
        author="Wikipedia contributors",
        content_html=clean_wikipedia_html(html, f"https://{host}/wiki/{title}"),
    )


def clean_wikipedia_html(html: str, page_url: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body or soup
    for el in body.select(_DROP):
        el.decompose()

    # Top-level sections only: a "Notes" subsection inside the article is text.
    for heading in body.select("section > h2, section > div.mw-heading > h2"):
        if heading.get_text(" ", strip=True).lower() in _BACK_MATTER:
            section = heading.find_parent("section")
            for later in section.find_next_siblings("section"):
                later.decompose()
            section.decompose()
            break

    # Parsoid links are page-relative ("./Zeno_of_Citium") and images
    # scheme-relative ("//upload.wikimedia.org/…"): make both absolute so the
    # book's links work and the EPUB renderer can fetch the figures.
    for a in body.find_all("a", href=True):
        # A figure links to its file page; the book wants the picture only.
        if a.find("img") and not a.get_text(strip=True):
            a.unwrap()
            continue
        a["href"] = urljoin(page_url, a["href"])
    for img in body.find_all("img", src=True):
        img["src"] = urljoin(page_url, img["src"])
    return "".join(str(child) for child in body.children)
