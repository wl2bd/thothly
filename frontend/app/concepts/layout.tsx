import Link from "next/link";

import { concepts } from "./data";

export const metadata = { title: "Concepts - Thothly", robots: { index: false } };

// A floating switcher so the three layouts can be compared in one tab.
export default function ConceptsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <nav className="bg-foreground text-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full p-1 text-xs shadow-lg">
        {concepts.map((c) => (
          <Link key={c.href} href={c.href} className="hover:bg-background/15 rounded-full px-3 py-1.5">
            {c.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
