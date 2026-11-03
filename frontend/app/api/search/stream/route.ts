import { BACKEND_URL } from "@/lib/backend";

// Pass the backend's NDJSON stream through line by line: buffering it here would
// make the fastest provider wait for the slowest again.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const acceptLanguage = request.headers.get("accept-language");
  try {
    const res = await fetch(`${BACKEND_URL}/search/stream?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
      signal: request.signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      return Response.json(
        data ?? { detail: `The server returned an empty response (${res.status}).` },
        { status: res.ok ? 502 : res.status },
      );
    }
    return new Response(res.body, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { detail: "The server isn't responding. Check that the backend is running." },
      { status: 502 },
    );
  }
}
