import { BACKEND_URL } from "@/lib/backend";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/jobs/${id}/download`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "Download failed" }));
      return Response.json(data, { status: res.status });
    }

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") ?? "application/epub+zip");
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new Response(res.body, { status: 200, headers });
  } catch {
    return Response.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
