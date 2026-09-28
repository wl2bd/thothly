import { AppHeader } from "@/components/app-header";
import { Compose } from "@/components/compose";
import { Workspace } from "@/components/compilation-pane";

// The workspace is the home page: search on one side, the compilation it builds
// on the other. What used to persuade a stranger (How it works, the FAQ) lives
// on /about. On a wide screen the page is exactly the viewport and each pane
// scrolls on its own, so the compilation and its Review button never leave the
// screen while the results scroll.
export default async function Home({
  searchParams,
}: {
  // A Promise in Next 16. Kept so old /app?q=… links still arrive searching.
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <AppHeader />
      <Workspace>
        <Compose initialQuery={q} />
      </Workspace>
    </div>
  );
}
