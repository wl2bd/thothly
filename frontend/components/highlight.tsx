import { Fragment, type ReactNode } from "react";

// Highlight every whitespace-separated term of `query` within `text` with a
// subtle gold <mark>, so a search result or filter shows *what* matched. Shared
// by the home source search and the review title filter so the highlight reads
// the same on both screens. Case-insensitive; the query is treated as literal
// text (each term is regex-escaped). Low-opacity gold so it never reads as a
// gold selection control.
export function highlightMatch(text: string, query: string): ReactNode {
  const terms = Array.from(
    new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean)),
  ).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;

  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  // split() with a capturing group keeps the matches, at the odd indices.
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-gold/30 rounded-[2px] text-inherit">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
