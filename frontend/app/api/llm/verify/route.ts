import { proxyJson } from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyJson("/llm/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
