// What a compilation gives, for each use on the home page: a real one, made by
// the app from three Wikipedia articles (free to republish) and shipped as
// files in /public/examples. The reading one opens as a book; the AI one shows
// the Markdown file exactly as an AI would get it, with a formatted view beside
// it, since raw Markdown doesn't show at a glance that the content came through.
export const EXAMPLES = {
  stoicism: { title: "Stoicism", view: "book" },
  "how-transformers-work": { title: "How transformers work", view: "markdown" },
} as const satisfies Record<string, { title: string; view: "book" | "markdown" }>;

export type ExampleSlug = keyof typeof EXAMPLES;

// The page that shows one example, so the home page cannot link to a slug that
// has no page.
export function examplePath(slug: ExampleSlug): string {
  return `/examples/${slug}`;
}
