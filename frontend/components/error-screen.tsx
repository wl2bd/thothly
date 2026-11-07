"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { markReload, shouldReload } from "@/lib/stale-deploy";

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// What a crashed page shows. A crash caused by a deploy landing while the tab
// was open reloads once on its own (the screen stays blank meanwhile); any
// other error says so and offers Reload / Back.
export function ErrorScreen({ error }: { error: Error & { digest?: string } }) {
  // Error screens render only in the browser, so storage is there to read.
  const [reloading] = useState(() => shouldReload(error, sessionStore()));

  useEffect(() => {
    const storage = sessionStore();
    if (reloading && storage) {
      markReload(storage);
      window.location.reload();
      return;
    }
    console.error(error);
  }, [error, reloading]);

  if (reloading) return null;
  return (
    <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-24">
      <h1 className="text-xl font-medium">This page couldn&rsquo;t load</h1>
      <p className="text-muted-foreground text-sm">Reload to try again, or go back.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>
    </main>
  );
}
