"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// Temporary: compares background textures on the real page. Remove with the
// `[data-bg]` rules at the end of globals.css once one is chosen.
const OPTIONS = [
  { id: "", label: "Actuel" },
  { id: "dots", label: "1 · Points" },
  { id: "rules", label: "2 · Réglure" },
  { id: "rings", label: "3 · Ondes" },
  { id: "mesh", label: "4 · Dégradé riche" },
];

export function BgDemo() {
  const [bg, setBg] = useState("");
  useEffect(() => {
    if (bg) document.documentElement.setAttribute("data-bg", bg);
    else document.documentElement.removeAttribute("data-bg");
  }, [bg]);
  return (
    <nav className="bg-foreground text-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full p-1 text-xs shadow-lg">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setBg(o.id)}
          className={cn("rounded-full px-3 py-1.5", bg === o.id ? "bg-background/20" : "hover:bg-background/10")}
        >
          {o.label}
        </button>
      ))}
    </nav>
  );
}
