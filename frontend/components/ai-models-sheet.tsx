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

// The visitor's own models, set once and rarely touched again, so they open in
// a side panel over the current screen instead of a page of their own: close
// it and the work is where it was.
export function AiModelsSheet({ triggerClassName }: { triggerClassName?: string }) {
  return (
    <Sheet>
      <SheetTrigger className={triggerClassName}>AI models</SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="gap-1 border-b px-6 pt-6 pb-5">
          <SheetTitle className="font-display text-xl font-normal tracking-tight">
            AI models
          </SheetTitle>
          <SheetDescription>
            Optional. Your own models, one to polish text and one to transcribe podcasts.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-6">
          <ModelSettingsPanel />
        </div>
      </SheetContent>
    </Sheet>
  );
}
