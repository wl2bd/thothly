import { proxyJson } from "@/lib/backend";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  return proxyJson(`/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
}
