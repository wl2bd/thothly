"""A cover set at review: the visitor's image, their text, and the preview."""

import io
from datetime import datetime, timezone
from unittest.mock import patch

from PIL import Image

from app.jobs import repository
from app.jobs.cover import apply_to_book, parse_authors
from app.jobs.cover_image import cover_image_path
from app.jobs.models import CoverSettings, DiscoveredItemResponse, JobCreate, Source
from app.pipeline.models import CompiledBook, CompiledChapter
from app.render.cover import CoverDesign, generate_cover
from app.render.epub import _metadata_yaml


def _png(size=(800, 600), color=(200, 40, 40)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="PNG")
    return out.getvalue()


def _reviewing_job() -> str:
    job = repository.create_job(JobCreate(sources=[Source(url="https://site.example")]))
    item = DiscoveredItemResponse(
        id=f"{job.id}-0-0", title="A post", url="https://site.example/a",
        item_type="blog", source_index=0, item_index=0,
    )
    repository.save_discovered_items(job.id, [item])
    repository.update_job_status(job.id, "reviewing", book_title="Notes")
    return job.id


def _book(**kw) -> CompiledBook:
    chapter = CompiledChapter(
        title="c", source_type="blog", source_url="https://s.example/a",
        content_md="x", author="Ada",
    )
    return CompiledBook(title="T", generated_at=datetime.now(timezone.utc), chapters=[chapter], **kw)


def test_authors_line_splits_on_commas_and_blank_means_the_sources():
    assert parse_authors(" Ada Lovelace,  Alan Turing ,") == ["Ada Lovelace", "Alan Turing"]
    assert parse_authors("   ") is None
    assert parse_authors(" , ,") is None
    assert parse_authors(None) is None


def test_upload_over_the_cap_is_refused_before_it_is_read(client):
    job_id = _reviewing_job()
    resp = client.post(
        f"/jobs/{job_id}/cover/image", content=b"x" * (8 * 1024 * 1024 + 1),
        headers={"content-type": "image/png"},
    )
    assert resp.status_code == 413


def test_an_image_that_would_unpack_huge_is_refused(client):
    job_id = _reviewing_job()
    resp = client.post(
        f"/jobs/{job_id}/cover/image", content=_png((4000, 4000)),
        headers={"content-type": "image/png"},
    )
    assert resp.status_code == 400


def test_a_photo_cover_is_packed_as_jpeg(tmp_path):
    from app.render.epub import make_cover

    photo = tmp_path / "p.png"
    photo.write_bytes(_png())
    out = make_cover(_book(), tmp_path / "cover.png", CoverDesign(background=photo, emblem="none"))
    assert out.suffix == ".jpg" and Image.open(out).format == "JPEG"


def test_typed_authors_and_subtitle_reach_the_epub_metadata():
    book = _book()
    apply_to_book(book, CoverSettings(subtitle=" A reader ", authors="Grace Hopper"))
    yaml = _metadata_yaml(book)
    assert 'subtitle: "A reader"' in yaml
    assert '- "Grace Hopper"' in yaml and "Ada" not in yaml


def test_without_settings_the_sources_are_credited():
    book = _book()
    apply_to_book(book, CoverSettings())
    assert book.credited_authors == ["Ada"]
    assert "subtitle" not in _metadata_yaml(book)


def test_a_tint_changes_the_ground(tmp_path):
    out = generate_cover("T", [], tmp_path / "c.png", design=CoverDesign(tint="ink"))
    assert max(Image.open(out).getpixel((5, 5))) < 60


def test_an_image_ground_fills_the_frame_and_is_darkened(tmp_path):
    photo = tmp_path / "p.png"
    photo.write_bytes(_png(color=(250, 250, 250)))
    out = generate_cover("T", [], tmp_path / "c.png", design=CoverDesign(background=photo))
    img = Image.open(out)
    assert img.size == (1600, 2560)
    assert max(img.getpixel((5, 5))) < 200  # white photo under a scrim


def test_upload_is_fitted_to_the_cover_frame(client):
    job_id = _reviewing_job()
    resp = client.post(
        f"/jobs/{job_id}/cover/image", content=_png((3000, 1000)),
        headers={"content-type": "image/png"},
    )
    assert resp.status_code == 200
    assert resp.json()["cover_image"] is True
    assert Image.open(cover_image_path(job_id)).size == (1600, 2560)

    resp = client.delete(f"/jobs/{job_id}/cover/image")
    assert resp.json()["cover_image"] is False


def test_upload_refuses_what_is_not_an_image(client):
    job_id = _reviewing_job()
    resp = client.post(
        f"/jobs/{job_id}/cover/image", content=b"%PDF-1.4 nope",
        headers={"content-type": "image/png"},
    )
    assert resp.status_code == 400
    assert not cover_image_path(job_id).exists()


def test_upload_after_review_is_refused(client):
    job_id = _reviewing_job()
    repository.update_job_status(job_id, "processing")
    resp = client.post(f"/jobs/{job_id}/cover/image", content=_png())
    assert resp.status_code == 409


def test_preview_returns_a_jpeg_thumbnail(client):
    job_id = _reviewing_job()
    with patch("app.jobs.cover.emblem_urls", return_value=[]):
        resp = client.post(
            f"/jobs/{job_id}/cover/preview",
            json={"title": "Notes", "cover": {"subtitle": "On things", "tint": "gold"}},
        )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(resp.content)).width <= 532


def test_confirm_keeps_the_cover_for_the_compile(client):
    job_id = _reviewing_job()
    with patch("app.jobs.router.run_compilation"):
        resp = client.post(
            f"/jobs/{job_id}/confirm",
            json={"selected_ids": [f"{job_id}-0-0"], "cover": {"tint": "stone", "emblem": "none"}},
        )
    assert resp.status_code == 200
    cover = repository.get_job_cover(job_id)
    assert (cover.tint, cover.emblem) == ("stone", "none")
