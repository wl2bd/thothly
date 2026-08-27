"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

// Light/dark toggle. The actual class on <html> is set before paint by the
// inline script in app/layout.tsx (no flash); this just flips it and persists
// the choice. We read the live class on mount rather than trusting a default,
// so the icon always matches what's on screen. Until mounted we render a
// stable, invisible icon so server and client markup agree (no hydration jump).
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    // The theme class is set pre-hydration by the no-flash script; read it once
    // on mount to render the matching icon (a client-only value).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode / storage blocked: the in-page toggle still works */
    }
    setDark(next);
  }

  const label = dark ? "Switch to light theme" : "Switch to dark theme";

  // Dressed like every other icon-only control in the app (secondary surface,
  // icon size, a tooltip carrying the description): a header is no reason for
  // a control to be its own species.
  return (
    <Tooltip content={label}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={toggle}
        aria-label={label}
      >
        {dark === null ? (
          <MoonIcon className="opacity-0" />
        ) : dark ? (
          <SunIcon />
        ) : (
          <MoonIcon />
        )}
      </Button>
    </Tooltip>
  );
}
