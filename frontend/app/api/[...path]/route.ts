// Every /api/* request goes to the FastAPI backend as-is, so a new backend
// endpoint needs no route here. BACKEND_URL stays server-side.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

// Request headers worth passing on: the body's type, and the language that
// localizes YouTube's fallback titles.
const FORWARDED = ["content-type", "accept-language"];

async function proxy(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const { search } = new URL(request.url);
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/${path.map(encodeURIComponent).join("/")}${search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { detail: "The server isn't responding. Check that the backend is running." },
      { status: 502 },
    );
  }
  // Streamed through, never buffered: a search sends one line per provider as
  // each answers, and a download is a whole book.
  const out = new Headers();
  for (const name of ["content-type", "content-disposition", "cache-control"]) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("x-accel-buffering", "no");
  return new Response(res.body, { status: res.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
