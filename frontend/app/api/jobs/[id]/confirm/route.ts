import { proxyJson } from "@/lib/backend";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(`/jobs/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
