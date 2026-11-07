import io

import httpx

from app.render import images


def _png(n: int = 64) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * n


def _image(data: bytes):
    return lambda request: httpx.Response(200, content=data, headers={"content-type": "image/png"})


def test_localizes_remote_image_and_embeds_it(tmp_path, web):
    web(_image(_png()))
    md = "![un chat](https://example.org/cat.png)"
    result = images.localize_images(md, tmp_path / "media")

    assert "https://" not in result
    assert "![un chat](" in result
    # exactly one file written, with the content-type-derived extension
    files = list((tmp_path / "media").iterdir())
    assert len(files) == 1 and files[0].suffix == ".png"


def test_drops_unreachable_image(tmp_path, web):
    web(lambda request: httpx.Response(404))
    md = "avant ![alt](https://example.org/x.png) après"
    result = images.localize_images(md, tmp_path / "media")

    assert "https://" not in result
    assert "![" not in result  # image markup removed entirely
    assert "avant" in result and "après" in result


def test_leaves_local_references_untouched(tmp_path, web):
    def boom(request):
        raise AssertionError("should not download local refs")

    web(boom)
    md = "![local](media/pic.png)"
    assert images.localize_images(md, tmp_path / "media") == md


def test_oversized_image_is_dropped(tmp_path, web):
    web(_image(b"\x00" * (images._MAX_BYTES + 100)))
    md = "![big](https://example.org/big.png)"
    result = images.localize_images(md, tmp_path / "media")

    assert result == ""
    assert list((tmp_path / "media").iterdir()) == []


def test_recompress_downscales_wide_image():
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (4000, 1000), color=(123, 200, 50)).save(buffer, format="JPEG")
    original = buffer.getvalue()

    result = images._recompress(original, ".jpg")

    assert len(result) < len(original)
    assert Image.open(io.BytesIO(result)).width == images._MAX_IMAGE_WIDTH


def test_recompress_unknown_format_is_passthrough():
    assert images._recompress(b"<svg/>", ".svg") == b"<svg/>"


def test_a_caption_holding_a_link_keeps_the_image_and_its_link(tmp_path, web):
    # A figure's caption is the image's description: "[Iceland](…)" inside it
    # used to end the match, so the link was fetched as the image.
    fetched = []

    def serve(request):
        fetched.append(str(request.url))
        return _image(_png())(request)

    web(serve)
    md = "![Ice near [Iceland](https://w.test/Iceland), 2007.](https://example.org/ice.png)"
    result = images.localize_images(md, tmp_path / "media")

    assert fetched == ["https://example.org/ice.png"]
    assert result.startswith("![Ice near [Iceland](https://w.test/Iceland), 2007.](")
    assert "example.org" not in result
