from app.pipeline.i18n import (
    chrome,
    detect_language,
    dominant_language,
    normalize_language,
)

FR = (
    "Le stoïcisme est une école de philosophie qui enseigne que la vertu est le seul bien. "
    "Pour les stoïciens, il ne faut pas se soucier de ce qui ne dépend pas de nous, et "
    "c'est dans la raison que se trouve la paix. Les disciples de cette école sont nombreux "
    "et leurs écrits nous parlent encore, avec une clarté qui étonne."
) * 2
EN = (
    "Stoicism is a school of philosophy that teaches that virtue is the only good. For the "
    "Stoics, you should not worry about what is not up to you, and it is in reason that "
    "peace is found. This was taught to many, and they have not been forgotten."
) * 2


def test_normalize_language():
    assert normalize_language("fr-FR") == "fr"
    assert normalize_language("en-orig") == "en"
    assert normalize_language("PT_br") == "pt"
    assert normalize_language("") is None
    assert normalize_language(None) is None
    assert normalize_language("français") is None


def test_detect_language():
    assert detect_language(FR) == "fr"
    assert detect_language(EN) == "en"
    assert detect_language("Bonjour à tous.") is None  # too short to call


def test_dominant_language_weighs_by_text():
    assert dominant_language([("fr", 5000), ("en", 1200), ("en", 1000)]) == "fr"
    assert dominant_language([(None, 900), ("de", 10)]) == "de"
    assert dominant_language([(None, 900)]) == "en"
    assert dominant_language([]) == "en"


def test_chrome_follows_language_with_english_fallback():
    assert chrome("fr")["toc"] == "Table des matières"
    assert chrome("ja")["toc"] == "Table of contents"
    assert chrome(None)["preface"] == "Preface"


# --- The language carried through the book ---------------------------------
from datetime import datetime, timezone  # noqa: E402

from app.pipeline.audit import split_chapters  # noqa: E402
from app.pipeline.models import CompiledBook, CompiledChapter  # noqa: E402
from app.render.epub import _metadata_yaml  # noqa: E402
from app.sources.blog import _html_language  # noqa: E402
from app.sources.youtube import _pick_subtitle_track  # noqa: E402


def _book(language: str, chapters: list[CompiledChapter], preface: str | None = None):
    return CompiledBook(
        title="Livre", generated_at=datetime(2026, 9, 23, tzinfo=timezone.utc),
        chapters=chapters, language=language, preface=preface,
    )


def _chapter(title: str, language: str | None) -> CompiledChapter:
    return CompiledChapter(
        title=title, source_type="blog", source_url="https://ex.com/a",
        author="Ann", content_md="Texte.", language=language,
    )


def test_book_chrome_follows_its_language():
    md = _book("fr", [_chapter("Stoïcisme", "fr"), _chapter("Stoicism", "en")],
               preface="Bienvenue.").to_markdown()
    assert "# Sources {.front-matter}" in md
    assert "# Préface {.front-matter}" in md
    assert "# Stoïcisme {lang=fr}" in md
    assert "# Stoicism {lang=en}" in md
    assert "*Auteur: Ann*" in md
    # The French labels inside the English chapter are marked French.
    assert md.count("::: {.source-attribution lang=fr}") == 1
    assert md.count("::: {.source-attribution}") == 1


def test_chapter_without_known_language_has_no_attribute():
    md = _book("en", [_chapter("Plain", None)]).to_markdown()
    assert "\n# Plain\n" in md


def test_split_chapters_skips_front_matter_in_any_language_and_strips_attributes():
    md = _book("de", [_chapter("Stoa", "de")], preface="Hallo.").to_markdown()
    assert list(split_chapters(md)) == ["Stoa"]
    legacy = "# Sources\n\n- [A](u)\n\n# Preface\n\nHi.\n\n# A\n\nBody."
    assert list(split_chapters(legacy)) == ["A"]


def test_epub_metadata_declares_the_book_language():
    yaml = _metadata_yaml(_book("fr", [_chapter("Stoïcisme", "fr")]))
    assert 'lang: "fr"' in yaml
    assert 'toc-title: "Table des matières"' in yaml


def test_original_language_subtitles_beat_a_preferred_translation():
    track = lambda: [{"ext": "json3", "url": "u"}]  # noqa: E731
    info = {"language": "fr", "subtitles": {"en": track(), "fr": track()},
            "automatic_captions": {}}
    assert _pick_subtitle_track(info, ["en"])[0] == "fr"
    # Human subtitles in the original language beat its auto-captions.
    info = {"language": "fr", "subtitles": {"fr": track()},
            "automatic_captions": {"fr": track()}}
    assert _pick_subtitle_track(info, ["en"]) == ("fr", "u")
    # A hand-made translation still beats a machine one when the original is missing.
    info = {"language": "fr", "subtitles": {"en": track()},
            "automatic_captions": {"en": track()}}
    assert _pick_subtitle_track(info, ["en"])[0] == "en"


def test_html_language():
    assert _html_language('<!doctype html><html lang="fr-FR" class="x">') == "fr"
    assert _html_language("<html xml:lang='de'>") == "de"
    assert _html_language("<html>") is None
