"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

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

  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    const apply = () => {
      root.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
        /* private mode / storage blocked: the in-page toggle still works */
      }
      setDark(next);
    };
    // The new theme spreads from the button in a widening circle (styled in
    // globals.css under [data-theme-switch]); a plain swap where View
    // Transitions or motion aren't available.
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    root.style.setProperty("--theme-x", `${x}px`);
    root.style.setProperty("--theme-y", `${y}px`);
    root.style.setProperty(
      "--theme-r",
      `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`,
    );
    root.dataset.themeSwitch = "";
    document.startViewTransition(apply).finished.finally(() => delete root.dataset.themeSwitch);
  }

  const label = dark ? "Switch to light theme" : "Switch to dark theme";

  // This lives in the header, so it takes the header's register rather than
  // the app's: the nav variant, which is the same muted-to-foreground colour
  // shift the anchors beside it use. A surfaced button here would read as the
  // bar's primary action, which the theme is not.
  return (
    <Button
      type="button"
      variant="nav"
      size="icon-sm"
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
  );
}
