import type { Metadata } from "next";
import Link from "next/link";

import { AppSurface } from "@/components/app-surface";
import { Logotype } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Compose · Thothly",
  // The landing is the page worth finding; this one is a workspace behind it,
  // and a search result landing a stranger on a bare field would explain nothing.
  robots: { index: false, follow: true },
};

// The tool. A Server Component shell around one client island, the same way the
// landing composes: the header and the column are plain HTML, and only Compose
// ships JS.
export default async function AppPage({
  searchParams,
}: {
  // A Promise in Next 16, and reading it opts this route into dynamic
  // rendering — which is right: the query comes in on the request.
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <main className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-10 py-12">
        {/* A workspace header, not the landing's: the identity and the one
            global control, without the section navigation. The logotype goes
            home, which is where the story lives. */}
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logotype className="h-8 w-auto" title="Thothly" />
          </Link>
          <ThemeToggle />
        </header>
        <AppSurface initialQuery={q} />
      </div>
    </main>
  );
}
