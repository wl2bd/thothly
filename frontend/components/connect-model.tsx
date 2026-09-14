"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fetchLlmConfig, verifyKey, type LlmConfig } from "@/lib/api";
import { maskKey, writeModels, type StoredEndpoint } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";

export type ModelKind = "llm" | "stt";

const KIND_COPY: Record<ModelKind, { name: string; title: string; purpose: string }> = {
  llm: {
    name: "AI polish model",
    title: "Connect a model",
    purpose: "Punctuates and tidies transcripts and articles.",
  },
  stt: {
    name: "Transcription",
    title: "Connect transcription",
    purpose: "Turns podcast episodes into text.",
  },
};

const PRIVACY =
  "Your key stays in this browser. Thothly sends it to your provider only to check it and to run a compilation you start, and never stores it.";

// The stored endpoint for one kind: a summary with Replace and Remove once a key
// is saved, the connect form otherwise. Shared by the review dialog and /settings.
export function ModelEndpointSettings({
  kind,
  config,
  onSaved,
}: {
  kind: ModelKind;
  config: LlmConfig;
  onSaved?: () => void;
}) {
  const models = useStoredModels();
  const current = models[kind];
  const [replacing, setReplacing] = useState(false);

  function save(endpoint: StoredEndpoint | null) {
    writeModels({ ...models, [kind]: endpoint });
    setReplacing(false);
    if (endpoint) onSaved?.();
  }

  if (current && !replacing) {
    const label =
      current.provider === "custom"
        ? "Your own server"
        : (config.providers.find((p) => p.id === current.provider)?.label ?? current.provider);
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-background flex items-center gap-3 rounded-lg border px-4 py-3">
          <ProviderIcon provider={current.provider} className="size-5 shrink-0" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium">
              {label} <span className="text-muted-foreground font-normal">· {current.model}</span>
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {maskKey(current.apiKey)}
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => save(null)}>
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EndpointForm
      kind={kind}
      config={config}
      initial={current}
      onSave={save}
      onCancel={current ? () => setReplacing(false) : undefined}
    />
  );
}

// ponytail: name match only, so a transcription model the pattern misses sits
// further down the list rather than being hidden. Widen the pattern if one does.
const TRANSCRIPTION_MODEL = /whisper|voxtral|transcri/i;

function orderModels(ids: string[], kind: ModelKind): string[] {
  if (kind === "llm") return ids;
  return [...ids.filter((m) => TRANSCRIPTION_MODEL.test(m)), ...ids.filter((m) => !TRANSCRIPTION_MODEL.test(m))];
}

function EndpointForm({
  kind,
  config,
  initial,
  onSave,
  onCancel,
}: {
  kind: ModelKind;
  config: LlmConfig;
  initial: StoredEndpoint | null;
  onSave: (endpoint: StoredEndpoint) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const options = [
    ...config.providers
      .filter((p) => kind === "llm" || p.stt_per_minute != null)
      .map((p) => ({ value: p.id, label: p.label })),
    ...(config.custom_base_url_allowed ? [{ value: "custom", label: "Your own server" }] : []),
  ].map((o) => ({ ...o, icon: <ProviderIcon provider={o.value} className="size-4" /> }));
  const [provider, setProvider] = useState(initial?.provider ?? options[0]?.value ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = provider === "custom";
  const canCheck = !checking && (isCustom ? baseUrl.trim() !== "" : apiKey.trim() !== "");

  // Any change to what was checked invalidates the check.
  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setModels(null);
      setModel("");
      setError(null);
    };
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!canCheck) return;
    setChecking(true);
    setError(null);
    try {
      const list = orderModels(
        await verifyKey(provider, apiKey.trim(), isCustom ? baseUrl.trim() : undefined),
        kind,
      );
      setModels(list);
      if (list.length === 0) setError("That key works, but it doesn't grant any model.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">No provider offers this here yet.</p>;
  }

  return (
    <form onSubmit={check} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-provider`} className="text-sm font-medium">
          Provider
        </label>
        <Select
          id={`${id}-provider`}
          value={provider}
          onValueChange={edit(setProvider)}
          options={options}
        />
      </div>

      {isCustom && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-url`} className="text-sm font-medium">
            Server address
          </label>
          <Input
            id={`${id}-url`}
            type="url"
            value={baseUrl}
            onChange={(e) => edit(setBaseUrl)(e.target.value)}
            placeholder="http://localhost:11434/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-key`} className="text-sm font-medium">
          API key{isCustom && <span className="text-muted-foreground font-normal"> (if your server needs one)</span>}
        </label>
        <Input
          id={`${id}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => edit(setApiKey)(e.target.value)}
          placeholder={initial ? `Replacing ${maskKey(initial.apiKey)}` : "Paste your key"}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {error && <Notice variant="error">{error}</Notice>}

      {models && models.length > 0 ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-model`} className="text-sm font-medium">
              Model
            </label>
            <Select
              id={`${id}-model`}
              value={model}
              onValueChange={setModel}
              options={models.map((m) => ({ value: m, label: m }))}
              placeholder="Choose a model"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!model}
              onClick={() =>
                onSave({
                  provider,
                  apiKey: apiKey.trim(),
                  model,
                  ...(isCustom ? { baseUrl: baseUrl.trim() } : {}),
                })
              }
            >
              Save
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" disabled={!canCheck}>
            {checking && <Spinner className="size-4" />}
            {checking ? "Checking…" : "Check key"}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

// The in-flow entry from the review screen: one kind at a time, the one the
// visitor just reached for. Closes itself once a checked key is saved. Changing
// or removing a key later lives on /settings too.
export function ConnectModelDialog({
  kind,
  config,
  onOpenChange,
}: {
  kind: ModelKind | null;
  config: LlmConfig;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = KIND_COPY[kind ?? "llm"];
  return (
    <Dialog.Root open={kind !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl border p-6 shadow-xl transition-[opacity,scale] duration-150 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <div className="flex flex-col gap-1.5 pr-8">
            <Dialog.Title className="text-base font-semibold">{copy.title}</Dialog.Title>
            <Dialog.Description className="text-muted-foreground text-sm">
              {copy.purpose} {PRIVACY}
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close"
            render={<Button variant="nav" size="icon-sm" className="absolute top-4 right-4" />}
          >
            <XIcon />
          </Dialog.Close>
          {kind && (
            <ModelEndpointSettings kind={kind} config={config} onSaved={() => onOpenChange(false)} />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModelSettingsSections({ config }: { config: LlmConfig }) {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">{PRIVACY}</p>
      {(["llm", "stt"] as const).map((kind) => (
        <section key={kind} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold">{KIND_COPY[kind].name}</h2>
            <p className="text-muted-foreground text-xs">{KIND_COPY[kind].purpose}</p>
          </div>
          <ModelEndpointSettings kind={kind} config={config} />
        </section>
      ))}
    </div>
  );
}

// /settings: both kinds, for changing a model, replacing an expired key or
// erasing one from this browser.
export function ModelSettingsPanel() {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchLlmConfig()
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  if (error) return <Notice variant="error">{error}</Notice>;
  if (!config) return <Spinner className="text-muted-foreground size-5" />;
  return <ModelSettingsSections config={config} />;
}
