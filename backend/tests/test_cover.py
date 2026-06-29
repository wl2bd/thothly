from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from app.render import epub as epub_module
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


def test_source_emblem_uses_favicon_for_single_blog(tmp_path, monkeypatch):
    called = {}

    def fake_fetch(url, dest, timeout=15.0):
        called["url"] = url
        dest.write_bytes(b"x")
        return dest

    monkeypatch.setattr(epub_module, "fetch_favicon", fake_fetch)
    book = _book([_ch("blog", "https://learnweb3.design/notes/a")])
    out = epub_module._source_emblem(book, tmp_path)
    assert out is not None and called["url"].startswith("https://learnweb3.design")


def test_source_emblem_none_for_multiple_domains(tmp_path, monkeypatch):
    monkeypatch.setattr(epub_module, "fetch_favicon", lambda *a, **k: 1 / 0)
    book = _book([_ch("blog", "https://a.com/x"), _ch("blog", "https://b.com/y")])
    assert epub_module._source_emblem(book, tmp_path) is None


def test_source_emblem_none_for_mixed_blog_and_youtube(tmp_path, monkeypatch):
    monkeypatch.setattr(epub_module, "fetch_favicon", lambda *a, **k: 1 / 0)
    monkeypatch.setattr(epub_module, "fetch_channel_avatar_url", lambda *a, **k: 1 / 0)
    book = _book([
        _ch("blog", "https://a.com/x"),
        _ch("youtube", "https://youtube.com/watch?v=1", channel_url="https://youtube.com/channel/C"),
    ])
    assert epub_module._source_emblem(book, tmp_path) is None


def test_source_emblem_uses_avatar_for_single_channel(tmp_path, monkeypatch):
    monkeypatch.setattr(
        epub_module, "fetch_channel_avatar_url", lambda url: "https://yt3/avatar.png"
    )

    def fake_icon(url, dest, *a, **k):
        dest.write_bytes(b"x")
        return dest

    monkeypatch.setattr(epub_module, "fetch_remote_icon", fake_icon)
    book = _book([
        _ch("youtube", "https://youtube.com/watch?v=1", channel_url="https://youtube.com/channel/C"),
        _ch("youtube", "https://youtube.com/watch?v=2", channel_url="https://youtube.com/channel/C"),
    ])
    assert epub_module._source_emblem(book, tmp_path) is not None


def test_source_emblem_none_for_multiple_channels(tmp_path, monkeypatch):
    monkeypatch.setattr(epub_module, "fetch_channel_avatar_url", lambda *a, **k: 1 / 0)
    book = _book([
        _ch("youtube", "https://youtube.com/watch?v=1", channel_url="https://youtube.com/channel/A"),
        _ch("youtube", "https://youtube.com/watch?v=2", channel_url="https://youtube.com/channel/B"),
    ])
    assert epub_module._source_emblem(book, tmp_path) is None


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
