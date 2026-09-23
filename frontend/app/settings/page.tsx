import type { Metadata } from "next";
import Link from "next/link";

import { Logotype } from "@/components/brand";
import { ModelSettingsPanel } from "@/components/connect-model";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Settings - Thothly",
  robots: { index: false, follow: true },
};

// Where a visitor's own keys are changed or erased. Same workspace header as
// /app; the keys themselves only ever exist in this browser.
export default function SettingsPage() {
  return (
    <main id="main" className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-10 py-12">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logotype className="h-8 w-auto" title="Thothly" />
          </Link>
          <ThemeToggle />
        </header>
        <div className="flex flex-col gap-2">
          <Link
            href="/app"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← Back to compose
          </Link>
          <h1 className="font-display text-3xl tracking-tight">Your models</h1>
        </div>
        <ModelSettingsPanel />
      </div>
    </main>
  );
}
