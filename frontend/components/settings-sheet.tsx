"use client";

import { ModelSettingsPanel } from "@/components/connect-model";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// Settings, one place for them all; for now the visitor's own AI models. Set
// once and rarely touched again, so they open in a side panel over the current screen instead of a page of their own: close
// it and the work is where it was. On a wide screen it takes the compilation
// pane's exact place (under the header, 400px, no veil), so it reads as the
// pane turning over rather than a second sidebar.
export function SettingsSheet({ triggerClassName }: { triggerClassName?: string }) {
  return (
    <Sheet>
      <SheetTrigger className={triggerClassName}>Settings</SheetTrigger>
      <SheetContent
        showOverlay={false}
        className="bg-card gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md lg:shadow-none data-[side=right]:lg:top-14 data-[side=right]:lg:h-[calc(100%-3.5rem)] data-[side=right]:lg:max-w-[400px]"
      >
        <SheetHeader className="gap-1 border-b px-6 pt-6 pb-5">
          <SheetTitle className="font-display text-xl font-normal tracking-tight">
            Settings
          </SheetTitle>
          <SheetDescription>Saved in this browser.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
          <section aria-labelledby="settings-ai" className="flex flex-col gap-3">
            <h3 id="settings-ai" className="eyebrow">
              AI models
            </h3>
            <p className="text-muted-foreground text-sm">
              Optional. Your own models, one to polish text and one to transcribe podcasts.
            </p>
            <ModelSettingsPanel />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
