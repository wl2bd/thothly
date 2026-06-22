import { proxyJson } from "@/lib/backend";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  return proxyJson(`/jobs/${id}/items/${itemId}/preview`, { cache: "no-store" });
}
