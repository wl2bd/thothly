import { redirect } from "next/navigation";

// The tool used to live here, behind a landing page. It is the home page now;
// this keeps old links and bookmarks working.
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  redirect(q ? `/?q=${encodeURIComponent(q)}` : "/");
}
