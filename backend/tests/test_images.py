import io
from urllib.error import HTTPError

import pytest

from app.render import images


class _FakeResponse(io.BytesIO):
    def __init__(self, data: bytes, content_type: str):
        super().__init__(data)
        self._content_type = content_type

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    class _Headers:
        def __init__(self, content_type: str):
            self._content_type = content_type

        def get_content_type(self):
            return self._content_type

    @property
    def headers(self):
        return self._Headers(self._content_type)


def _png(n: int = 64) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * n


def test_localizes_remote_image_and_embeds_it(tmp_path, monkeypatch):
    def fake_urlopen(request, timeout):
        return _FakeResponse(_png(), "image/png")

    monkeypatch.setattr(images, "urlopen", fake_urlopen)
    md = "![un chat](https://example.org/cat.png)"
    result = images.localize_images(md, tmp_path / "media")

    assert "https://" not in result
    assert "![un chat](" in result
    # exactly one file written, with the content-type-derived extension
    files = list((tmp_path / "media").iterdir())
    assert len(files) == 1 and files[0].suffix == ".png"


def test_drops_unreachable_image(tmp_path, monkeypatch):
    def fake_urlopen(request, timeout):
        raise HTTPError("https://example.org/x.png", 404, "Not Found", {}, None)

    monkeypatch.setattr(images, "urlopen", fake_urlopen)
    md = "avant ![alt](https://example.org/x.png) après"
    result = images.localize_images(md, tmp_path / "media")

    assert "https://" not in result
    assert "![" not in result  # image markup removed entirely
    assert "avant" in result and "après" in result


def test_leaves_local_references_untouched(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("should not download local refs")

    monkeypatch.setattr(images, "urlopen", boom)
    md = "![local](media/pic.png)"
    assert images.localize_images(md, tmp_path / "media") == md


def test_oversized_image_is_dropped(tmp_path, monkeypatch):
    def fake_urlopen(request, timeout):
        return _FakeResponse(b"\x00" * (images._MAX_BYTES + 100), "image/png")

    monkeypatch.setattr(images, "urlopen", fake_urlopen)
    md = "![big](https://example.org/big.png)"
    result = images.localize_images(md, tmp_path / "media")

    assert result == ""
    assert list((tmp_path / "media").iterdir()) == []
