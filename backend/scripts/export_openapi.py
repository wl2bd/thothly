"""Write the API's OpenAPI schema to frontend/lib/openapi.json, which the
frontend's types are generated from (`pnpm api:types`). A test fails when the
committed file no longer matches the code."""

import json
from pathlib import Path

from app.main import app

TARGET = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "openapi.json"


def schema_text() -> str:
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    TARGET.write_text(schema_text(), encoding="utf-8")
    print(TARGET)
