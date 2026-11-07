"""Generate a minimalist editorial cover for the EPUB.

Matches the frontend identity: a warm cream field, an ink-coloured title in the
brand typeface, and a small circular emblem near the top. The emblem defaults to
the Thothly favicon but is a parameter, so a per-source image (e.g. a YouTube
channel avatar) can be slotted in — circular, the way an avatar reads.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image, ImageDraw, ImageFont, ImageOps

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
# The brand "thothly" lettering, baked from the logo to an alpha silhouette
# (scripts bake it via sharp from frontend/components/brand.tsx). Stamped at the
# foot and recoloured here, so it replaces the plain text colophon.
_WORDMARK_PATH = _ASSETS / "wordmark.png"

# Standard EPUB cover proportions (~1:1.6 portrait).
_W, _H = 1600, 2560
_MARGIN = 190
_EMBLEM_SIZE = 150
_WORDMARK_WIDTH = 360


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
_GOLD = _oklch_to_rgb(0.78, 0.15, 75)

Tint = Literal["cream", "stone", "ink", "gold"]
EmblemChoice = Literal["source", "thothly", "none"]


@dataclass(frozen=True)
class Palette:
    ground: tuple[int, int, int]
    title: tuple[int, int, int]
    # Subtitle and authors: the quiet voice under the title.
    quiet: tuple[int, int, int]
    # The wordmark at the foot.
    mark: tuple[int, int, int]


# The grounds a visitor can pick. Each keeps the brand's two voices, a stark
# neutral or the desert gold, with ink or cream type at full contrast on it.
PALETTES: dict[str, Palette] = {
    "cream": Palette(_CREAM, _INK, _MUTED, _OCHRE),
    "stone": Palette(
        _oklch_to_rgb(0.9, 0.016, 80), _INK, _oklch_to_rgb(0.45, 0.022, 62), _OCHRE
    ),
    "ink": Palette(
        _oklch_to_rgb(0.2, 0.01, 60),
        _oklch_to_rgb(0.95, 0.012, 84),
        _oklch_to_rgb(0.74, 0.02, 70),
        _GOLD,
    ),
    "gold": Palette(_GOLD, _INK, _oklch_to_rgb(0.34, 0.05, 60), _INK),
}
# Over a visitor's own image: light type on the darkened photo.
_ON_IMAGE = Palette(
    _INK, _oklch_to_rgb(0.97, 0.01, 84), _oklch_to_rgb(0.88, 0.012, 80), _GOLD
)
# How much the photo is darkened under the type, 0-255.
_SCRIM_ALPHA = 140


@dataclass(frozen=True)
class CoverDesign:
    """What a visitor chose for the cover. The defaults are the house cover."""

    tint: Tint = "cream"
    emblem: EmblemChoice = "source"
    subtitle: str | None = None
    # Their own image, laid as the ground under the type. Wins over the tint.
    background: Path | None = None


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


def _draw_ring(
    image: Image.Image, at: tuple[int, int], size: int, color: tuple[int, int, int]
) -> None:
    """An antialiased circle outline just outside a `size` disc placed at `at`."""
    pad, width, scale = 6, 3, 4
    side = (size + 2 * pad) * scale
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), outline=110, width=width * scale)
    mask = mask.resize((size + 2 * pad,) * 2, Image.LANCZOS)
    image.paste(Image.new("RGB", mask.size, color), (at[0] - pad, at[1] - pad), mask)


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


def _balanced_wrap(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int
) -> list[str]:
    """Like `_wrap`, but evens the lines out — the cover's `text-wrap: balance`.

    Greedy wrapping fills each line to the brim, which strands a lone word on the
    last line ("…the Way You / Live"). Keeping the SAME line count, we find the
    narrowest width that still achieves it: that pulls words down and balances the
    rag, so a short title sits as even, centred lines.
    """
    greedy = _wrap(draw, text, font, width)
    if len(greedy) <= 1:
        return greedy
    target = len(greedy)
    # The narrowest line still has to hold the single widest word.
    longest = max((draw.textlength(w, font=font) for w in text.split()), default=0)
    lo, hi, best = int(longest), width, greedy
    while lo <= hi:
        mid = (lo + hi) // 2
        candidate = _wrap(draw, text, font, mid)
        if len(candidate) <= target:
            best, hi = candidate, mid - 1
        else:
            lo = mid + 1
    return best


def _clamp(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    width: int,
    max_lines: int,
) -> list[str]:
    """Keep at most `max_lines`, the last one ending in an ellipsis when cut."""
    if len(lines) <= max_lines:
        return lines
    kept = lines[:max_lines]
    last = " ".join(lines[max_lines - 1 :])
    while last and draw.textlength(last + "…", font=font) > width:
        last = last[:-1]
    if " " in last:  # end on a whole word
        last = last[: last.rfind(" ")]
    kept[-1] = last.rstrip(" ,·") + "…"
    return kept


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


def _draw_wordmark(
    image: Image.Image, draw: ImageDraw.ImageDraw, color: tuple[int, int, int] = _OCHRE
) -> None:
    """Stamp the brand wordmark at the foot, recoloured to the gold accent.

    `wordmark.png` is an alpha silhouette of the "thothly" lettering; we tint
    it by laying its own alpha over a solid `_OCHRE` fill, so the colour stays
    defined here in one place rather than baked into the asset. If the asset is
    missing we fall back to the wordmark set in text, so the cover always keeps
    its colophon.
    """
    y_bottom = _H - _MARGIN
    if _WORDMARK_PATH.exists():
        wm = Image.open(_WORDMARK_PATH).convert("RGBA")
        w = _WORDMARK_WIDTH
        h = round(wm.height * w / wm.width)
        wm = wm.resize((w, h), Image.LANCZOS)
        tint = Image.new("RGBA", wm.size, (*color, 255))
        tint.putalpha(wm.getchannel("A"))
        image.paste(tint, ((_W - w) // 2, y_bottom - h), tint)
        return
    logger.warning("Wordmark not found at %s; using text colophon", _WORDMARK_PATH)
    font = _font(44, weight=500)
    cw = draw.textlength("thothly", font=font)
    draw.text(((_W - cw) // 2, y_bottom - 60), "thothly", font=font, fill=color)


def fit_to_cover(img: Image.Image) -> Image.Image:
    """Crop and scale any image to the cover's portrait frame, centred, the
    way CSS `object-fit: cover` does. A phone photo is turned upright first."""
    img = ImageOps.exif_transpose(img).convert("RGB")
    return ImageOps.fit(img, (_W, _H), Image.LANCZOS)


def _ground(design: CoverDesign) -> tuple[Image.Image, Palette]:
    if design.background is not None and design.background.exists():
        photo = fit_to_cover(Image.open(design.background))
        scrim = Image.new("RGB", photo.size, (0, 0, 0))
        return Image.blend(photo, scrim, _SCRIM_ALPHA / 255), _ON_IMAGE
    palette = PALETTES.get(design.tint, PALETTES["cream"])
    return Image.new("RGB", (_W, _H), palette.ground), palette


def generate_cover(
    title: str,
    authors: list[str],
    output_path: Path,
    emblem_path: Path | None = None,
    design: CoverDesign | None = None,
) -> Path:
    """Render the cover PNG to *output_path* and return it.

    *emblem_path* is the source's own mark; None falls back to the Thothly
    emblem, unless the design asks for no emblem at all."""
    design = design or CoverDesign()
    image, palette = _ground(design)
    draw = ImageDraw.Draw(image)
    text_width = _W - 2 * _MARGIN

    # Strip glyphs the cover fonts can't render so it never shows tofu boxes (the
    # book's real title in the EPUB metadata is untouched). Title and authors use
    # different fonts, so each is probed against the font it will actually be set
    # in. Glyph coverage is size-independent, so one probe per font is enough.
    title = _strip_unrenderable(title, _font(100, font_path=_TITLE_FONT))
    text_probe = _font(100, font_path=_TEXT_FONT)
    authors = [a for a in (_strip_unrenderable(a, text_probe) for a in authors) if a]
    subtitle = _strip_unrenderable(design.subtitle or "", text_probe)

    # Emblem — a modest CIRCULAR mark, centred near the top (an avatar reads as
    # an avatar). No rule beneath it: the title below carries the structure.
    emblem_file = emblem_path or _EMBLEM_PATH
    if design.emblem == "none":
        pass
    elif emblem_file.exists():
        emblem = _circle_crop(Image.open(emblem_file).convert("RGBA"), _EMBLEM_SIZE)
        x, y = (_W - emblem.width) // 2, 470
        if sum(palette.ground) < 3 * 110:
            # A dark ground swallows a dark mark (the Thothly emblem is one):
            # a hairline in the quiet tone keeps its edge.
            _draw_ring(image, (x, y), _EMBLEM_SIZE, palette.quiet)
        image.paste(emblem, (x, y), emblem)
    else:
        logger.warning("Cover emblem not found at %s; skipping", emblem_file)

    # Title — large, left-aligned, auto-sized to stay within ~4 lines, then
    # balanced so the lines come out even (no stranded last word).
    size = 150
    while size > 80:
        title_font = _font(size, weight=600, font_path=_TITLE_FONT)
        if len(_wrap(draw, title, title_font, text_width)) <= 4:
            break
        size -= 12
    lines = _balanced_wrap(draw, title, title_font, text_width)
    line_height = round(size * 1.16)

    # Subtitle — the sans, a step up from the authors, right under the title.
    subtitle_font = _font(64, weight=450)
    subtitle_lines = (
        _clamp(draw, _balanced_wrap(draw, subtitle, subtitle_font, text_width), subtitle_font, text_width, 2)
        if subtitle
        else []
    )
    _SUBTITLE_GAP = 52     # title → subtitle
    _SUBTITLE_LINE_H = 88

    # Authors — lighter, muted, sit just below the title.
    author_font = _font(56, weight=420)
    author_lines = (
        _clamp(
            draw,
            _balanced_wrap(draw, "  ·  ".join(authors), author_font, text_width),
            author_font,
            text_width,
            2,
        )
        if authors
        else []
    )
    _AUTHOR_GAP = 60       # title → authors
    _AUTHOR_LINE_H = 84

    # Centre the whole title+authors block vertically (the emblem stays up top,
    # the colophon at the foot), so a one-line and a four-line title both sit
    # balanced instead of anchored to a fixed Y that left a short title floating.
    block_h = (
        len(lines) * line_height
        + (_SUBTITLE_GAP + len(subtitle_lines) * _SUBTITLE_LINE_H if subtitle_lines else 0)
        + (_AUTHOR_GAP + len(author_lines) * _AUTHOR_LINE_H if author_lines else 0)
    )
    y = round(_H * 0.5 - block_h / 2)
    # A long block never climbs onto the emblem: it starts below it instead
    # and runs toward the wordmark, which the line caps above keep it clear of.
    y = max(y, 470 + _EMBLEM_SIZE + 90)

    for line in lines:
        lw = draw.textlength(line, font=title_font)
        draw.text(((_W - lw) / 2, y), line, font=title_font, fill=palette.title)
        y += line_height

    if subtitle_lines:
        y += _SUBTITLE_GAP
        for line in subtitle_lines:
            lw = draw.textlength(line, font=subtitle_font)
            draw.text(((_W - lw) / 2, y), line, font=subtitle_font, fill=palette.quiet)
            y += _SUBTITLE_LINE_H

    if author_lines:
        y += _AUTHOR_GAP
        for line in author_lines:
            lw = draw.textlength(line, font=author_font)
            draw.text(((_W - lw) / 2, y), line, font=author_font, fill=palette.quiet)
            y += _AUTHOR_LINE_H

    # Wordmark at the foot, in place of a plain "thothly" in text.
    _draw_wordmark(image, draw, palette.mark)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # A photo cover as PNG weighs ~5 MB; as JPEG under 1 MB. Flat grounds stay PNG.
    jpeg = output_path.suffix.lower() in (".jpg", ".jpeg")
    image.save(output_path, format="JPEG" if jpeg else "PNG", **({"quality": 88} if jpeg else {}))
    return output_path
