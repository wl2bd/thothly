"use client";

import { Kbd } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import { ViewTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { AppHeader } from "@/components/app-header";
import { CompilationPane, WorkPane, Workspace } from "@/components/compilation-pane";
import { clearDraft } from "@/lib/workspace-draft";
import { withBrowserModels } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";
import { cn, plural } from "@/lib/utils";
import { fetchLlmConfig, NO_MODELS, type LlmConfig } from "@/lib/api";
import { CompletedView } from "./completed";
import { CompilingView, DiscoveringView, FailedView, StopButton } from "./progress";
import { ReviewView } from "./review";
import { BackToSources, StatusMessage, WaitingButton } from "./shared";
import { useJob } from "./use-job";

export default function JobPage() {
  const router = useRouter();
  // N starts a new compilation from any step, like the New compilation button.
  useShortcut("n", () => {
    clearDraft();
    router.push("/");
  });
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { job, error, applyJob, updateItem } = useJob(id);

  const [llm, setLlm] = useState<LlmConfig | null>(null);
  // A key the visitor saved in this browser counts as much as the server's own.
  const storedModels = useStoredModels();
  const effectiveLlm = useMemo(
    () => withBrowserModels(llm, storedModels),
    [llm, storedModels],
  );
  useEffect(() => {
    fetchLlmConfig()
      .then(setLlm)
      // The free path works without the config, so a failed read means "no
      // models" rather than an error screen.
      .catch(() => setLlm(NO_MODELS));
  }, []);

  // The one way out of a finished or failed compilation.
  const newCompilation = (
    <Link
      href="/"
      onClick={clearDraft}
      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
    >
      New compilation
      <Kbd>N</Kbd>
    </Link>
  );

  // Each step fills both panes: what it is working on, on the left; the
  // compilation, on the right. Review and the finished book lay out their own
  // two panes; the simpler steps are laid out here.
  let panes: ReactNode;
  if (!job) {
    panes = (
      <>
        <WorkPane>
          {error ? (
            <Notice variant="error">{error}</Notice>
          ) : (
            <StatusMessage label="Loading…" />
          )}
        </WorkPane>
        <CompilationPane
          eyebrow="Opening"
          title="Loading…"
          titleClassName="text-muted-foreground"
          footer={error ? newCompilation : <WaitingButton label="Loading…" />}
        />
      </>
    );
  } else if (job.status === "discovering") {
    panes = (
      <>
        <WorkPane>
          <BackToSources jobId={id} sources={job.sources} title={job.book_title ?? null} />
          <DiscoveringView sources={job.sources} />
        </WorkPane>
        <CompilationPane
          eyebrow="Finding sources"
          title={job.book_title ?? ""}
          meta={plural(job.sources.length, "source")}
          footer={<WaitingButton label="Finding sources…" />}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            Listing what each source contains. You pick what goes in next.
          </p>
        </CompilationPane>
      </>
    );
  } else if (job.status === "reviewing") {
    panes = <ReviewView job={job} llm={effectiveLlm} onConfirmed={applyJob} onItemChange={updateItem} />;
  } else if (job.status === "processing") {
    const built = job.discovered_items.filter(
      (it) => it.compile_state === "done",
    ).length;
    panes = (
      <>
        <WorkPane>
          <CompilingView items={job.discovered_items} />
        </WorkPane>
        <CompilationPane
          eyebrow="Compiling"
          title={job.book_title ?? ""}
          meta={`${built} of ${job.discovered_items.length} ready`}
          footer={<StopButton jobId={id} built={built} />}
        >
          <p className="text-muted-foreground text-sm leading-relaxed">
            This can take a few minutes. It keeps going if you leave, and waits
            for you in Your compilations.
          </p>
        </CompilationPane>
      </>
    );
  } else if (job.status === "completed") {
    panes = <CompletedView jobId={id} job={job} />;
  } else {
    panes = (
      <>
        <WorkPane>
          <FailedView job={job} />
        </WorkPane>
        <CompilationPane
          eyebrow="Did not finish"
          title={job.book_title ?? ""}
          meta={plural(job.sources.length, "source")}
          footer={newCompilation}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <AppHeader />
      <Workspace>
        {/* Each step arrives like a new page; the card itself morphs (flow-card). */}
        <ViewTransition key={job?.status ?? "opening"} enter="page" exit="page" default="none">
          {panes}
        </ViewTransition>
      </Workspace>
    </div>
  );
}
