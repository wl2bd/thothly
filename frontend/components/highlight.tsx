import { Fragment, type ReactNode } from "react";

// Mark every whitespace-separated term of `query` within `text` in a heavier
// weight, so a search result or filter shows *what* matched. Shared
// by the home source search and the review title filter so the highlight reads
// the same on both screens. Case-insensitive; the query is treated as literal
// text (each term is regex-escaped). Weight, not a fill: the gold stays for
// actions, and a list of fifty titles isn't striped with it.
export function highlightMatch(text: string, query: string): ReactNode {
  const terms = Array.from(
    new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean)),
  ).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;

  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  // split() with a capturing group keeps the matches, at the odd indices.
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-transparent font-semibold text-inherit">
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
