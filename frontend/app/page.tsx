export const dynamic = "force-dynamic";

type HealthResponse = { status: string; version: string };

type HealthResult =
  | { ok: true; data: HealthResponse }
  | { ok: false; error: string };

async function fetchHealth(): Promise<HealthResult> {
  const baseUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} from ${baseUrl}/health` };
    }
    const data = (await res.json()) as HealthResponse;
    return { ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${message} (BACKEND_URL=${baseUrl})` };
  }
}

export default async function Home() {
  const health = await fetchHealth();

  return (
    <main className="flex min-h-screen items-center justify-center p-8 font-sans">
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Thothly</h1>
        {health.ok ? (
          <p className="text-lg">
            Backend status:{" "}
            <span className="font-mono text-emerald-600">
              {health.data.status}
            </span>{" "}
            <span className="text-muted-foreground text-sm">
              (v{health.data.version})
            </span>
          </p>
        ) : (
          <p className="text-lg text-red-600">
            Backend unreachable:{" "}
            <span className="font-mono text-sm">{health.error}</span>
          </p>
        )}
      </div>
    </main>
  );
}
