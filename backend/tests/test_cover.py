from PIL import Image

from app.render.cover import _oklch_to_rgb, generate_cover


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
