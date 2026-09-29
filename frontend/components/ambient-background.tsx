"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// three.js is heavy: the page paints first, the wash fades in after.
const Watercolor = dynamic(() => import("@/components/watercolor"), { ssr: false });

// The workspace's ground: a slow two-tone wash (React Bits Watercolor), faint
// enough to be felt rather than seen. Neutral into the brand gold; it sits
// behind everything and never under text without a surface in between.
const TONES = {
  light: { color1: "#ffffff", color2: "#e9cf94", opacity: 0.55 },
  dark: { color1: "#0a0a0a", color2: "#5a4214", opacity: 0.6 },
};

// The theme toggle flips the class on <html>; follow it live.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function AmbientBackground() {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );
  const still = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  if (dark === null) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <Watercolor
        {...(dark ? TONES.dark : TONES.light)}
        // Reduced motion: the same wash, holding still.
        speed={still ? 0 : 0.25}
        saturation={1}
        brightness={0}
      />
    </div>
  );
}
