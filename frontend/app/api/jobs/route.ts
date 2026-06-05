import { proxyJson } from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyJson("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

export async function GET() {
  return proxyJson("/jobs", { cache: "no-store" });
}
