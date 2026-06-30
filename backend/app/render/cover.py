"""Generate a minimalist editorial cover for the EPUB.

Matches the frontend identity: a warm cream field, an ink-coloured title in the
brand typeface, and a small circular emblem near the top. The emblem defaults to
the Thothly favicon but is a parameter, so a per-source image (e.g. a YouTube
channel avatar) can be slotted in — circular, the way an avatar reads.
"""

import logging
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

_ASSETS = Path(__file__).parent / "assets"
# Cover typefaces: the brand fonts (frontend/app/fonts), copied into assets so the
# cover reads as the same edition as the app. The big title is set in Prociono
# (the brand's editorial display serif); everything else — authors, colophon — in
# Host Grotesk (the UI sans), so the title leads and the rest sits quietly under
# it. (Fraunces.ttf is kept in assets but no longer used.)
_TITLE_FONT = _ASSETS / "Prociono.otf"
_TEXT_FONT = _ASSETS / "HostGrotesk.ttf"
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


def _font(
    size: int, weight: int = 600, font_path: Path = _TEXT_FONT
) -> ImageFont.FreeTypeFont:
    """Load a cover font at `size`, setting `weight` when the font is variable.

    Works across font shapes without hardcoding an axis order: a variable font
    (Host Grotesk: a single `wght` axis; Fraunces: wght + opsz + …) gets each
    axis set by NAME, and a static font (Prociono) is returned untouched.
    """
    font = ImageFont.truetype(str(font_path), size)
    try:
        axes = font.get_variation_axes()
    except OSError:
        return font  # static font — no axes to set
    values: list[float] = []
    for ax in axes:
        name = ax.get("name", b"")
        name = name.decode() if isinstance(name, (bytes, bytearray)) else str(name)
        key = name.lower()
        if "weight" in key or key == "wght":
            values.append(weight)
        elif "optical" in key or key == "opsz":
            values.append(min(ax.get("maximum", 144), max(ax.get("minimum", 9), size)))
        else:
            values.append(ax.get("default", 0))
    try:
        font.set_variation_by_axes(values)
    except Exception:  # pragma: no cover — Pillow without the API
        pass
    return font


def _circle_crop(img: Image.Image, size: int) -> Image.Image:
    """Centre-crop to a square, resize to `size`, and mask to a clean circle.

    The mask is rendered at 4× and downsampled so the circle's edge is smooth
    (antialiased) rather than stair-stepped. An avatar reads as an avatar.
    """
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize(
        (size, size), Image.LANCZOS
    )
    scale = 4
    mask = Image.new("L", (size * scale, size * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * scale - 1, size * scale - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


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
    """Drop characters the cover font (a Latin typeface) has no glyph for.

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

    # Strip glyphs the cover fonts can't render so it never shows tofu boxes (the
    # book's real title in the EPUB metadata is untouched). Title and authors use
    # different fonts, so each is probed against the font it will actually be set
    # in. Glyph coverage is size-independent, so one probe per font is enough.
    title = _strip_unrenderable(title, _font(100, font_path=_TITLE_FONT))
    text_probe = _font(100, font_path=_TEXT_FONT)
    authors = [a for a in (_strip_unrenderable(a, text_probe) for a in authors) if a]

    # Emblem — a modest CIRCULAR mark, centred near the top (an avatar reads as
    # an avatar). No rule beneath it: the title below carries the structure.
    emblem_file = emblem_path or _EMBLEM_PATH
    if emblem_file.exists():
        emblem = _circle_crop(Image.open(emblem_file).convert("RGBA"), _EMBLEM_SIZE)
        image.paste(emblem, ((_W - emblem.width) // 2, 470), emblem)
    else:
        logger.warning("Cover emblem not found at %s; skipping", emblem_file)

    # Title — large, left-aligned, auto-sized to stay within ~4 lines.
    title_y = 1120
    size = 150
    while size > 80:
        title_font = _font(size, weight=600, font_path=_TITLE_FONT)
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
