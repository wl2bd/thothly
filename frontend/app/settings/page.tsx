import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { ModelSettingsPanel } from "@/components/connect-model";

export const metadata: Metadata = {
  title: "AI model - Thothly",
  robots: { index: false, follow: true },
};

// Where a visitor's own keys are changed or erased. The keys themselves only
// ever exist in this browser.
export default function SettingsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl tracking-tight">AI model</h1>
          <p className="text-muted-foreground text-sm">
            Optional. Connect your own model to polish transcripts. The key stays in this browser.
          </p>
        </div>
        <ModelSettingsPanel />
      </main>
    </div>
  );
}
