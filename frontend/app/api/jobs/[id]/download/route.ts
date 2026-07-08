import { BACKEND_URL } from "@/lib/backend";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") === "md" ? "md" : "epub";
  try {
    const res = await fetch(`${BACKEND_URL}/jobs/${id}/download?format=${format}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "The download failed." }));
      return Response.json(data, { status: res.status });
    }

    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("Content-Type") ?? "application/epub+zip");
    const disposition = res.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new Response(res.body, { status: 200, headers });
  } catch {
    return Response.json(
      { detail: "The server isn't responding. Check that the backend is running." },
      { status: 502 },
    );
  }
}
