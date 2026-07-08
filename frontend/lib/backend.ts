export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Proxy a request to the FastAPI backend and forward its JSON response and
 * status code unchanged. Keeps BACKEND_URL server-side only.
 */
export async function proxyJson(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, init);
    const data = await res.json().catch(() => null);
    return Response.json(
      data ?? { detail: `The server returned an empty response (${res.status}).` },
      { status: res.status },
    );
  } catch {
    return Response.json(
      { detail: "The server isn't responding. Check that the backend is running." },
      { status: 502 },
    );
  }
}
