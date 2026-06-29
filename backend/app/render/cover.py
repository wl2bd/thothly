"""Generate a minimalist editorial cover for the EPUB.

Matches the frontend "paper" identity: a warm cream field, ink-coloured serif
title (Fraunces), an ochre hairline, and a small emblem near the top. The
emblem defaults to the Thothly favicon but is a parameter, so a per-source
image (e.g. a YouTube channel avatar) can be slotted in later.
"""

import logging
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

_ASSETS = Path(__file__).parent / "assets"
_FONT_PATH = _ASSETS / "Fraunces.ttf"
_EMBLEM_PATH = _ASSETS / "emblem.png"

# Standard EPUB cover proportions (~1:1.6 portrait).
_W, _H = 1600, 2560
_MARGIN = 190
_EMBLEM_SIZE = 150


def _oklch_to_rgb(lightness: float, chroma: float, hue_deg: float) -> tuple[int, int, int]:
    """Convert an OKLCH colour (as used in the app's CSS) to an sRGB tuple."""
    import math

    hue = math.radians(hue_deg)
    a = chroma * math.cos(hue)
    b = chroma * math.sin(hue)

    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_**3, m_**3, s_**3

    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(c: float) -> int:
        c = max(0.0, min(1.0, c))
        c = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return round(max(0.0, min(1.0, c)) * 255)

    return gamma(r), gamma(g), gamma(bl)


# The three palette anchors, read straight from frontend/app/globals.css.
_CREAM = _oklch_to_rgb(0.972, 0.013, 84)
_INK = _oklch_to_rgb(0.245, 0.014, 56)
_OCHRE = _oklch_to_rgb(0.555, 0.13, 52)
_MUTED = _oklch_to_rgb(0.52, 0.022, 62)


def _font(size: int, weight: int = 600) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(_FONT_PATH), size)
    try:
        # Axis order matches the font: Optical Size, Weight, Softness, Wonky.
        font.set_variation_by_axes([min(144, max(9, size)), weight, 0, 0])
    except Exception:  # not a variable build / Pillow without the API
        pass
    return font


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if not current or draw.textlength(trial, font=font) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _strip_unrenderable(text: str, font: ImageFont.FreeTypeFont) -> str:
    """Drop characters the cover font (Fraunces, a Latin serif) has no glyph for.

    Such a character paints as the .notdef box (tofu □) on the cover even though
    the EPUB's own metadata keeps the full title. Every missing glyph maps to the
    SAME .notdef, so a char counts as missing when its advance + bbox match a
    sentinel noncharacter that no font ever assigns. Whitespace is always kept,
    and the gaps a dropped glyph leaves are collapsed (so "dive 😀" → "dive").
    """
    try:
        sentinel = chr(0xFDD0)  # a Unicode noncharacter: never carries a glyph
        notdef = (font.getlength(sentinel), font.getbbox(sentinel))
    except Exception:  # probing failed — never risk mangling the title
        return text
    kept: list[str] = []
    for ch in text:
        if ch.isspace():
            kept.append(ch)
            continue
        try:
            if (font.getlength(ch), font.getbbox(ch)) != notdef:
                kept.append(ch)
        except Exception:  # control / unrenderable → drop
            pass
    return " ".join("".join(kept).split())


def generate_cover(
    title: str,
    authors: list[str],
    output_path: Path,
    emblem_path: Path | None = None,
) -> Path:
    """Render the cover PNG to *output_path* and return it."""
    image = Image.new("RGB", (_W, _H), _CREAM)
    draw = ImageDraw.Draw(image)
    text_width = _W - 2 * _MARGIN

    # Strip glyphs Fraunces can't render so the cover never shows tofu boxes
    # (the book's real title in the EPUB metadata is untouched). Glyph coverage
    # is the same at any size, so one probe font serves both title and authors.
    probe = _font(100)
    title = _strip_unrenderable(title, probe)
    authors = [a for a in (_strip_unrenderable(a, probe) for a in authors) if a]

    # Emblem — kept at a modest size, centred near the top.
    emblem_file = emblem_path or _EMBLEM_PATH
    y = 430
    if emblem_file.exists():
        emblem = Image.open(emblem_file).convert("RGBA")
        emblem.thumbnail((_EMBLEM_SIZE, _EMBLEM_SIZE))
        image.paste(emblem, ((_W - emblem.width) // 2, y), emblem)
        y += emblem.height + 70
    else:
        logger.warning("Cover emblem not found at %s; skipping", emblem_file)

    # Ochre hairline, centred.
    rule_half = 80
    draw.line([(_W // 2 - rule_half, y), (_W // 2 + rule_half, y)], fill=_OCHRE, width=3)

    # Title — large serif, left-aligned, auto-sized to stay within ~4 lines.
    title_y = 1120
    size = 150
    while size > 80:
        title_font = _font(size, weight=600)
        lines = _wrap(draw, title, title_font, text_width)
        if len(lines) <= 4:
            break
        size -= 12
    line_height = round(size * 1.16)
    for line in lines:
        draw.text((_MARGIN, title_y), line, font=title_font, fill=_INK)
        title_y += line_height

    # Authors — lighter, muted, just below the title.
    if authors:
        author_font = _font(56, weight=420)
        author_text = "  ·  ".join(authors)
        for line in _wrap(draw, author_text, author_font, text_width):
            title_y += 18
            draw.text((_MARGIN, title_y), line, font=author_font, fill=_MUTED)
            title_y += 70

    # Colophon at the foot.
    colophon_font = _font(44, weight=500)
    colophon = "thothly"
    cw = draw.textlength(colophon, font=colophon_font)
    draw.text(((_W - cw) // 2, _H - 230), colophon, font=colophon_font, fill=_OCHRE)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, format="PNG")
    return output_path
