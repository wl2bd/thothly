# Thothly frontend

Next.js 16 app for Thothly. Setup, configuration and architecture live in the
[root README](../README.md).

```bash
pnpm install
BACKEND_URL=http://127.0.0.1:8000 pnpm dev
```

Every `/api/*` request is forwarded to the backend by one route
(`app/api/[...path]/route.ts`), so a new backend endpoint needs nothing here.

The API types in `lib/api-schema.d.ts` are generated from `lib/openapi.json`,
which the backend writes. After changing a backend model:

```bash
cd ../backend && uv run python scripts/export_openapi.py
cd ../frontend && pnpm api:types
```

A backend test fails when `openapi.json` is stale, and CI fails when the types
are. CI runs `pnpm lint`, `pnpm test`, the type check and `pnpm build`.
