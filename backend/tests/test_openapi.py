from scripts.export_openapi import TARGET, schema_text


def test_the_frontend_schema_matches_the_api():
    """The frontend's types are generated from this file: an API change has to
    regenerate it (`uv run python scripts/export_openapi.py`, then
    `pnpm api:types` in frontend/)."""
    assert TARGET.read_text(encoding="utf-8") == schema_text()
