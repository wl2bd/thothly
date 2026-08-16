"use client";

import { useState } from "react";

import { CompilationHistory } from "@/components/compilation-history";
import { Compose } from "@/components/compose";

// The two halves of /app's primary action, and the one piece of state they
// share: whether the card is busy. It lives here rather than in either of them
// because /app's page is a Server Component and cannot hold it, and because
// neither half should have to know the other exists.
export function AppSurface({ initialQuery }: { initialQuery?: string }) {
  // Seeded from the incoming query so the list never flashes on arrival from
  // the landing: a query handed over is already searching on the first frame.
  const [cardIsBusy, setCardIsBusy] = useState(Boolean(initialQuery?.trim()));

  return (
    <>
      <Compose initialQuery={initialQuery} onQueryActiveChange={setCardIsBusy} />
      <CompilationHistory hidden={cardIsBusy} />
    </>
  );
}
