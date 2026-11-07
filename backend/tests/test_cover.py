from datetime import datetime, timezone

from PIL import Image

import pytest

from app.jobs import emblem
from app.render.cover import _font, _oklch_to_rgb, _strip_unrenderable, generate_cover
from app.render.images import _parse_icon_size
from app.pipeline.models import CompiledBook, CompiledChapter


def _book(chapters):
    return CompiledBook(
        title="T", generated_at=datetime.now(timezone.utc), chapters=chapters
    )


def _ch(source_type, url, channel_url=None):
    return CompiledChapter(
        title="c", source_type=source_type, source_url=url,
        content_md="x", channel_url=channel_url,
    )


def test_parse_icon_size():
    assert _parse_icon_size(None) == 0
    assert _parse_icon_size("32x32") == 32
    assert _parse_icon_size("180x180") == 180
    assert _parse_icon_size("any") == 0


@pytest.fixture
def lookups(monkeypatch):
    """Records which origin's mark was looked up, answering with a fake URL."""
    seen = []
    monkeypatch.setattr(emblem, "favicon_candidates", lambda url: seen.append(url) or [f"{url}/icon"])
    monkeypatch.setattr(
        emblem, "fetch_channel_avatar_url", lambda url: seen.append(url) or "https://yt3/avatar.png"
    )
    return seen


VIDEO_A = ("youtube", "https://youtube.com/watch?v=1", "https://youtube.com/channel/A")


def test_one_site_gives_its_icon(lookups):
    book = _book([_ch("blog", "https://site.example/notes/a"), _ch("blog", "https://site.example/b")])
    assert emblem.emblem_urls(book) == ["https://site.example/notes/a/icon"]


def test_one_channel_gives_its_avatar(lookups):
    book = _book([_ch(*VIDEO_A), _ch("youtube", "https://youtube.com/watch?v=2", VIDEO_A[2])])
    assert emblem.emblem_urls(book) == ["https://yt3/avatar.png"]


def test_episodes_do_not_count_against_a_single_origin(lookups):
    book = _book([_ch(*VIDEO_A), _ch("podcast", "https://cdn.example/ep.mp3")])
    assert emblem.emblem_urls(book) == ["https://yt3/avatar.png"]


@pytest.mark.parametrize("chapters", [
    [("blog", "https://a.com/x"), ("blog", "https://b.com/y")],
    [("blog", "https://a.com/x"), VIDEO_A],
    [VIDEO_A, ("youtube", "https://youtube.com/watch?v=2", "https://youtube.com/channel/B")],
])
def test_several_origins_keep_the_default_emblem(lookups, chapters):
    assert emblem.emblem_urls(_book([_ch(*c) for c in chapters])) == []
    assert lookups == []


def test_generate_cover_produces_portrait_png(tmp_path):
    out = generate_cover(
        "Récits et analyses théologiques",
        ["Marc Aurèle", "Chaîne Théologie"],
        tmp_path / "cover.png",
    )
    assert out.exists()
    with Image.open(out) as image:
        assert image.format == "PNG"
        assert image.height > image.width  # portrait


def test_generate_cover_handles_no_authors(tmp_path):
    out = generate_cover("Sans auteur", [], tmp_path / "c.png")
    assert out.exists()


def test_oklch_to_rgb_matches_known_anchor():
    # The cream background should land on a warm near-white.
    r, g, b = _oklch_to_rgb(0.972, 0.013, 84)
    assert r > 240 and g > 235 and b > 225 and r >= g >= b


def test_strip_unrenderable_drops_glyphs_fraunces_lacks():
    # A glyph Fraunces can't draw (emoji, other scripts) would paint as a tofu
    # box; it's dropped and the gap collapsed, while Latin + accents + the
    # punctuation the serif carries stay.
    probe = _font(100)
    assert _strip_unrenderable("Deep dive \U0001F600", probe) == "Deep dive"
    assert _strip_unrenderable("中文 title", probe) == "title"
    assert _strip_unrenderable("Élégance française", probe) == "Élégance française"
    assert _strip_unrenderable("A — B • C", probe) == "A — B • C"
    assert _strip_unrenderable("\U0001F600\U0001F680", probe) == ""
