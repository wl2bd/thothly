from datetime import datetime, timezone

from app.pipeline.models import CompiledBook, CompiledChapter
from app.render.epub import _metadata_yaml


def _book(title: str) -> CompiledBook:
    return CompiledBook(
        title=title,
        generated_at=datetime(2026, 6, 29, tzinfo=timezone.utc),
        chapters=[
            CompiledChapter(
                title="Ch",
                source_type="blog",
                source_url="https://example.com",
                content_md="body",
            )
        ],
    )


def test_metadata_yaml_keeps_non_bmp_literal():
    # A character outside the BMP (an emoji in a title) must stay literal UTF-8.
    # The default json.dumps (ensure_ascii=True) would split it into a surrogate
    # pair of \uXXXX escapes, which Pandoc's YAML parser rejects as an invalid
    # Unicode escape (the bug this guards).
    yaml = _metadata_yaml(_book("Best of 2026 \U0001F600"))
    assert "\U0001F600" in yaml
    assert "\\ud83d" not in yaml.lower()  # no surrogate escape leaked


def test_metadata_yaml_escapes_quotes_and_backslashes():
    # Quotes and backslashes still get JSON-style escapes, which a YAML
    # double-quoted scalar also accepts.
    yaml = _metadata_yaml(_book('A "quoted" tit\\le'))
    assert r'title: "A \"quoted\" tit\\le"' in yaml


def test_metadata_yaml_keeps_accents_literal():
    yaml = _metadata_yaml(_book("Élégance française"))
    assert "Élégance française" in yaml
