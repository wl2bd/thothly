import { proxyJson } from "@/lib/backend";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  // Forward the browser's Accept-Language so the backend can localize result
  // titles (YouTube) the way an anonymous visit would.
  const acceptLanguage = request.headers.get("accept-language");
  return proxyJson(`/search?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
    headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
  });
}
