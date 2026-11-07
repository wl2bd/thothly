"""An article's HTML as chapter Markdown."""

import re
from urllib.parse import unquote

from bs4 import BeautifulSoup, Tag
from markdownify import MarkdownConverter

from app.pipeline.models import escape_tags


def html_to_markdown(html: str) -> str:
    if not html or not html.strip():
        return ""
    # Markdown ends a link's URL at the first ")", so a target like
    # Naturalism_(philosophy) would land on the wrong page. Percent-encoded
    # parentheses are the same URL to every browser and e-reader.
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        if _links_to_its_own_image(a):
            a.unwrap()
            continue
        a["href"] = a["href"].replace("(", "%28").replace(")", "%29")
    # A <dl> with no term is an indent (Wikipedia's ":"): written as a
    # definition, Pandoc would make the paragraph above it the term.
    for dl in soup.find_all("dl"):
        if not dl.find("dt"):
            for dd in dl.find_all("dd"):
                dd.name = "div"
            dl.name = "div"
    _flatten_tables(soup)
    # Superscripts and subscripts stay inline HTML: flattened, "H2O" and "XIXe"
    # read as other words. Pandoc, GitHub and Obsidian all render the tags;
    # Pandoc's "^2^"/"~2~" would show as strikethrough on GitHub.
    return _Converter(
        heading_style="ATX", bullets="-", sup_symbol="<sup>", sub_symbol="<sub>"
    ).convert(str(soup)).strip()


_IMAGE_FILE = re.compile(r"\.(png|jpe?g|gif|webp|avif|svg)$", re.IGNORECASE)


def _links_to_its_own_image(a) -> bool:
    """An image wrapped in a link to its full-size copy (newsletter platforms
    do it to every image). Kept, it writes "[![](src)](href)": no longer a
    figure, and every reader shows it as a clickable thumbnail of itself."""
    imgs = a.find_all("img")
    if len(imgs) != 1 or a.get_text(strip=True):
        return False
    href = a["href"]
    return href == imgs[0].get("src") or bool(_IMAGE_FILE.search(unquote(href).split("?")[0]))


class _Converter(MarkdownConverter):
    def escape(self, text, parent_tags):
        # CommonMark's backslash escape keeps a literal "<div>" text in every
        # reader; raw HTML stays on for <sup>/<sub>.
        return escape_tags(super().escape(text, parent_tags))

    def convert_span(self, el, text, parent_tags):
        # Pandoc's math span: TeX between dollars, verbatim (an escaped "_"
        # breaks the formula). Pandoc writes it as MathML in the EPUB.
        classes = el.get("class") or []
        if "math" in classes:
            # A blank line would end the paragraph, and the formula with it.
            tex = re.sub(r"\n\s*\n", "\n", el.get_text().strip())
            if tex:
                return f"$${tex}$$" if "display" in classes else f"${tex}$"
        return text

    def convert_figure(self, el, text, parent_tags):
        # An image alone in its paragraph is a figure to Pandoc, its description
        # the <figcaption>: the caption is set apart instead of reading as one
        # more paragraph. A figure that isn't one image plus a caption is left
        # to the default.
        images = el.find_all("img")
        caption = el.find("figcaption")
        if len(images) != 1 or caption is None or not caption.get_text(strip=True):
            return text
        caption_md = " ".join(self.process_tag(caption, parent_tags | {"_inline"}).split())
        return f"\n\n![{caption_md}]({images[0].get('src', '')})\n\n"


# A footnote marker as sites set it: "[1]", "[d]", "[note 3]".
_FOOTNOTE_MARK = re.compile(r"^\[[\w\s]{1,10}\]$")


def _flatten_tables(soup: BeautifulSoup) -> None:
    """Rewrite each table as the plain grid a pipe table can hold.

    A pipe table has one header row and the same number of cells on every row;
    HTML tables have captions, title rows spanning the grid, rowspan/colspan and
    tables inside cells. Left alone, markdownify reads a title row as the header,
    the real header as a body row, and row widths drift.
    """
    for table in soup.find_all("table"):
        if table.decomposed or table.parent is None:
            continue
        rows = [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]
        cells = [tr.find_all(["td", "th"], recursive=False) for tr in rows]
        if table.find("table") or max(map(len, cells), default=0) <= 1:
            # A table holding a table, or a single column, is layout: its cells
            # become plain blocks, and an inner table is flattened on its own
            # later in the loop.
            box = soup.new_tag("div")
            for cell in (c for row in cells for c in row):
                cell.name = "div"
                box.append(cell.extract())
            table.replace_with(box)
            continue

        caption = table.find("caption")
        captions = [caption.get_text(" ", strip=True)] if caption else []
        width = max((sum(_span(c, "colspan") for c in row) for row in cells), default=0)
        # Title rows: one cell across a grid that has more than one column.
        while len(cells) > 1 and len(cells[0]) == 1 and width > 1:
            captions.append(cells.pop(0)[0].get_text(" ", strip=True))
            width = max(sum(_span(c, "colspan") for c in row) for row in cells)

        # Place every cell on a grid; a span leaves empty cells, not a shift.
        grid: list[dict[int, Tag | None]] = [{} for _ in cells]
        for r, row in enumerate(cells):
            col = 0
            for cell in row:
                while col in grid[r]:
                    col += 1
                for dr in range(min(_span(cell, "rowspan"), len(cells) - r)):
                    for dc in range(_span(cell, "colspan")):
                        grid[r + dr][col + dc] = cell if dr == dc == 0 else None
                col += _span(cell, "colspan")
        width = max((max(g, default=-1) + 1 for g in grid), default=0)

        flat = soup.new_tag("table")
        for r, row in enumerate(grid):
            tr = soup.new_tag("tr")
            header = all(c.name == "th" for c in cells[r])
            for col in range(width):
                cell = row.get(col)
                if cell is None:
                    cell = soup.new_tag("th" if header else "td")
                else:
                    cell.attrs = {}
                    for sup in cell.find_all("sup"):
                        if _FOOTNOTE_MARK.match(sup.get_text(strip=True)):
                            sup.decompose()
                    for text in cell.find_all(string=True):
                        if "|" in text:
                            text.replace_with(text.replace("|", "\\|"))
                tr.append(cell)
            flat.append(tr)
        for text in filter(None, captions):
            p = soup.new_tag("p")
            p.append(soup.new_tag("strong"))
            p.strong.string = text
            table.insert_before(p)
        table.replace_with(flat)


def _span(cell: Tag, attr: str) -> int:
    value = str(cell.get(attr, "1")).strip()
    return max(1, min(int(value), 50)) if value.isdigit() else 1


_ATX_HEADING = re.compile(r"^(#{1,6})(\s.*)$")


def _normalize_title(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


_LONE_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def _collapse_blank_runs(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        if not line.strip() and out and not out[-1].strip():
            continue
        out.append(line)
    return out


def strip_leading_title(markdown: str, title: str) -> str:
    """Drop a leading heading that merely repeats the chapter title.

    Article extractors (trafilatura) keep the article's own <h1> title at the
    top of the extracted content. Since we already emit that title as the
    chapter heading, it shows up twice in a row — and worse, it makes the real
    sections one level deeper, pushing them out of the table of contents.
    Remove the first heading when it matches the title.
    """
    lines = markdown.split("\n")
    for i, line in enumerate(lines):
        match = _ATX_HEADING.match(line)
        if not match:
            continue
        # A title written as a link to its own page ("# [Title](url)", Hugo themes).
        heading = _normalize_title(_LONE_LINK.sub(r"\1", match.group(2).strip()))
        wanted = _normalize_title(title)
        if heading == wanted or heading.startswith(wanted) or wanted.startswith(heading):
            del lines[i]
            if i < len(lines) and not lines[i].strip():
                del lines[i]
            # Above the title, a line that is only a link is the page's category
            # or breadcrumb, not the author's text. Images (a cover) stay.
            lines[:i] = [l for l in lines[:i] if not _LONE_LINK.fullmatch(l.strip())]
            lines[:i] = _collapse_blank_runs(lines[:i]) if i else lines[:i]
        break  # only the first heading can be the duplicated title
    return "\n".join(lines).lstrip("\n")


def demote_headings(markdown: str, floor: int = 2) -> str:
    """Shift a chapter body's headings so they nest under its title.

    Scraped articles keep their own headings; left as-is they can sit at or
    above the chapter title (an h1 in the book), flattening the table of
    contents. We shift every heading down so the shallowest becomes `floor`
    (h2 by default, i.e. just under the chapter), preserving the article's own
    relative structure. Code fences are left untouched so '#' comments aren't
    mistaken for headings.
    """
    lines = markdown.split("\n")
    levels = [len(m.group(1)) for _, m in _heading_lines(lines) if m]
    if not levels:
        return markdown
    shift = floor - min(levels)
    if shift <= 0:
        return markdown

    out: list[str] = []
    for line, in_code in _with_fence_state(lines):
        match = None if in_code else _ATX_HEADING.match(line)
        if match:
            level = min(6, len(match.group(1)) + shift)
            line = "#" * level + match.group(2)
        out.append(line)
    return "\n".join(out)


def _with_fence_state(lines: list[str]):
    """Yield (line, inside_code_fence) for each line."""
    in_fence = False
    for line in lines:
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            yield line, in_fence  # the fence line itself isn't a heading
            continue
        yield line, in_fence


def _heading_lines(lines: list[str]):
    """Yield (line, match) for heading lines outside code fences."""
    for line, in_code in _with_fence_state(lines):
        if not in_code:
            yield line, _ATX_HEADING.match(line)
