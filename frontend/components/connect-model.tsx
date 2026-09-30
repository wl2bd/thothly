"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { fetchLlmConfig, verifyKey, type LlmConfig } from "@/lib/api";
import { maskKey, parseModels, readModelsRaw, writeModels, type StoredEndpoint } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";

export type ModelKind = "llm" | "stt";

const KIND_COPY: Record<ModelKind, { name: string; title: string; purpose: string }> = {
  llm: {
    name: "Cleanup",
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
// is saved, the connect form otherwise. Shared by the review dialog and Settings.
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
        <div className="bg-card shadow-surface flex items-center gap-3 rounded-lg border px-4 py-3">
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
          <Button type="button" variant="outline" size="sm" onClick={() => setReplacing(true)}>
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

// Where each provider hands out keys. A provider missing here (or your own
// server) just gets no link.
const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  mistral: "https://console.mistral.ai/api-keys",
  openrouter: "https://openrouter.ai/settings/keys",
  groq: "https://console.groq.com/keys",
  together: "https://api.together.ai/settings/api-keys",
};

function GetKeyLink({ provider, label }: { provider: string; label: string }) {
  const href = KEY_PAGES[provider];
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs underline decoration-current/35 underline-offset-3"
    >
      Get a key from {label}
      <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  );
}

const TRANSCRIPTION_MODEL = /whisper|voxtral|transcri/i;


function providerOptions(config: LlmConfig, kind: ModelKind) {
  return [
    ...config.providers
      .filter((p) => kind === "llm" || p.stt_per_minute != null)
      .map((p) => ({ value: p.id, label: p.label })),
    ...(config.custom_base_url_allowed ? [{ value: "custom", label: "Your own server" }] : []),
  ].map((o) => ({ ...o, icon: <ProviderIcon provider={o.value} className="size-4" /> }));
}

function ProviderSelect({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: ReturnType<typeof providerOptions>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={options.map(({ value, label }) => ({ value, label }))}
      value={value}
      onValueChange={(v) => typeof v === "string" && onChange(v)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(v: string) => {
            const o = options.find((x) => x.value === v);
            return o ? (
              <>
                {o.icon}
                {o.label}
              </>
            ) : null;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.icon}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
  const options = providerOptions(config, kind);
  const [provider, setProvider] = useState(initial?.provider ?? options[0]?.value ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<KeyStatus>("idle");
  // The key + address the status is about, so a stale answer is dropped.
  const checked = useRef<string | null>(null);

  const isCustom = provider === "custom";

  // Any change to what was checked invalidates the check.
  function edit<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setModels(null);
      setModel("");
      setStatus("idle");
      checked.current = null;
    };
  }

  // Runs on paste and on blur, with the field's value at that moment.
  async function check(value: { apiKey: string; baseUrl: string }) {
    const sig = signature(value);
    if (isCustom ? !value.baseUrl.trim() : !value.apiKey.trim()) return;
    if (checked.current === sig) return;
    checked.current = sig;
    setStatus("checking");
    let list: string[] | null = null;
    try {
      list = modelsFor(
        await verifyKey(provider, value.apiKey.trim(), isCustom ? value.baseUrl.trim() : undefined),
        kind,
      );
    } catch {
      list = null;
    }
    if (checked.current !== sig) return;
    setStatus(list ? "valid" : "invalid");
    setModels(list);
  }

  const pasted = (e: FormEvent<HTMLInputElement>) =>
    (e.nativeEvent as InputEvent).inputType === "insertFromPaste";

  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">No provider offers this here yet.</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void check({ apiKey, baseUrl });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-provider`} className="text-sm font-medium">
          Provider
        </label>
        <ProviderSelect
          id={`${id}-provider`}
          options={options}
          value={provider}
          onChange={edit(setProvider)}
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
            onChange={(e) => {
              edit(setBaseUrl)(e.target.value);
              if (pasted(e)) void check({ apiKey, baseUrl: e.target.value });
            }}
            onBlur={() => void check({ apiKey, baseUrl })}
            placeholder="http://localhost:11434/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-key`} className="text-sm font-medium">
            API key{isCustom && <span className="text-muted-foreground font-normal"> (if your server needs one)</span>}
          </label>
          <KeyStatusText status={status} />
        </div>
        <Input
          id={`${id}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => {
            edit(setApiKey)(e.target.value);
            if (pasted(e)) void check({ apiKey: e.target.value, baseUrl });
          }}
          onBlur={() => void check({ apiKey, baseUrl })}
          placeholder={initial ? `Replacing ${maskKey(initial.apiKey)}` : "Paste your key"}
          autoComplete="off"
          spellCheck={false}
        />
        <GetKeyLink
          provider={provider}
          label={options.find((o) => o.value === provider)?.label ?? provider}
        />
      </div>

      {models && models.length === 0 && (
        <Notice variant="error">That key works, but it doesn&apos;t grant any model.</Notice>
      )}

      {models && models.length > 0 ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-model`} className="text-sm font-medium">
              Model
            </label>
            <Select
              value={model || null}
              onValueChange={(v) => typeof v === "string" && setModel(v)}
            >
              <SelectTrigger id={`${id}-model`} className="w-full">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="self-start">
            Cancel
          </Button>
        )
      )}
    </form>
  );
}

// The in-flow entry from the review screen: one kind at a time, the one the
// visitor just reached for, shown in the compilation pane in place of what it
// held (no pop-in over the page). Back once a checked key is saved. Changing or
// removing a key later lives in Settings too.
export function ConnectModelStep({
  kind,
  config,
  onDone,
}: {
  kind: ModelKind;
  config: LlmConfig;
  onDone: () => void;
}) {
  const copy = KIND_COPY[kind];
  // On a phone the pane sits under the list: bring the step into view.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);
  return (
    <div ref={ref} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} className="text-muted-foreground -ml-2.5 self-start">
          <ArrowLeftIcon />
          Back
        </Button>
        <h3 className="font-display text-xl tracking-tight">{copy.title}</h3>
        <p className="text-muted-foreground text-sm">
          {copy.purpose} {PRIVACY}
        </p>
      </div>
      <ModelEndpointSettings kind={kind} config={config} onSaved={onDone} />
      {kind === "llm" && <ModelInstructions config={config} />}
    </div>
  );
}

// ponytail: name match only. A list whose names say nothing of the task (a
// local server, say) is shown whole rather than emptied.
const NOT_TEXT_MODEL = /whisper|voxtral|transcri|tts|speech|audio|realtime|embed|moderation|image|dall-e/i;

function modelsFor(ids: string[], kind: ModelKind): string[] {
  const fit = ids.filter((m) =>
    kind === "stt" ? TRANSCRIPTION_MODEL.test(m) : !NOT_TEXT_MODEL.test(m),
  );
  return fit.length > 0 ? fit : ids;
}

// What runs when this browser holds no key: the server's own models if it has
// them, otherwise the free path.
function withoutKeyLine(config: LlmConfig): string {
  if (config.available && config.stt_available) return "Without a key, Thothly uses its default models.";
  if (config.available) return "Without a key, Thothly uses its default cleanup model. Podcast episodes need a transcription key.";
  if (config.stt_available) return "Without a key, Thothly uses its default transcription model. Cleanup needs a key.";
  return "Without a key, compilations are free: transcripts and articles are not cleaned up, and podcast episodes need a transcription key.";
}

type KeyStatus = "idle" | "checking" | "valid" | "invalid";

interface ProviderKey {
  apiKey: string;
  baseUrl: string;
  status: KeyStatus;
  models: string[];
}

const KINDS = ["llm", "stt"] as const;
const signature = (k: { apiKey: string; baseUrl: string }) => `${k.apiKey.trim()}\n${k.baseUrl.trim()}`;

// Settings: a key belongs to a provider and is entered once; each task picks a
// provider and one of its models. Storage keeps one full endpoint per task
// (lib/model-keys.ts), so the backend sees the same shape as before.
export function ModelSettingsSections({ config }: { config: LlmConfig }) {
  const id = useId();
  const stored = useStoredModels();
  const [providers, setProviders] = useState<Record<ModelKind, string>>(() => ({
    llm: stored.llm?.provider ?? providerOptions(config, "llm")[0]?.value ?? "",
    stt: stored.stt?.provider ?? providerOptions(config, "stt")[0]?.value ?? "",
  }));
  const [keys, setKeys] = useState<Record<string, ProviderKey>>(() => {
    const init: Record<string, ProviderKey> = {};
    for (const e of [stored.llm, stored.stt]) {
      if (e) init[e.provider] = { apiKey: e.apiKey, baseUrl: e.baseUrl ?? "", status: "checking", models: [] };
    }
    return init;
  });
  // Per provider, the key + address the current status is about. Written only
  // in handlers, so a check started from an edit sees it at once.
  const checked = useRef<Record<string, string | null>>({});

  const keyOf = (provider: string): ProviderKey =>
    keys[provider] ?? { apiKey: "", baseUrl: "", status: "idle", models: [] };

  function patch(provider: string, change: Partial<ProviderKey>) {
    setKeys((prev) => ({ ...prev, [provider]: { ...keyOf(provider), ...prev[provider], ...change } }));
  }

  async function check(provider: string, value: { apiKey: string; baseUrl: string }) {
    const sig = signature(value);
    const apiKey = value.apiKey.trim();
    const baseUrl = value.baseUrl.trim();
    if (provider === "custom" ? !baseUrl : !apiKey) {
      checked.current[provider] = null;
      return patch(provider, { status: "idle" });
    }
    if (checked.current[provider] === sig) return;
    checked.current[provider] = sig;
    patch(provider, { status: "checking" });
    await verify(provider, value);
  }

  async function verify(provider: string, value: { apiKey: string; baseUrl: string }) {
    const sig = signature(value);
    const apiKey = value.apiKey.trim();
    const baseUrl = value.baseUrl.trim();
    let models: string[] | null = null;
    try {
      models = await verifyKey(provider, apiKey, provider === "custom" ? baseUrl : undefined);
    } catch {
      models = null;
    }
    // A later edit has its own check under way: this answer is stale.
    if (checked.current[provider] !== sig) return;
    patch(provider, { status: models ? "valid" : "invalid", models: models ?? [] });
    if (!models) return;
    // A new valid key replaces the old one on every task that uses the provider.
    const now = parseModels(readModelsRaw());
    const next = { ...now };
    let changed = false;
    for (const kind of KINDS) {
      const e = now[kind];
      if (e?.provider === provider && (e.apiKey !== apiKey || (e.baseUrl ?? "") !== baseUrl)) {
        next[kind] = { ...e, apiKey, ...(provider === "custom" ? { baseUrl } : {}) };
        changed = true;
      }
    }
    if (changed) writeModels(next);
  }

  // Stored keys are checked when Settings opens: it lists their models and
  // flags one that has expired.
  useEffect(() => {
    for (const [provider, k] of Object.entries(keys)) {
      checked.current[provider] = signature(k);
      void verify(provider, k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit(provider: string, change: Partial<ProviderKey>, pasted: boolean) {
    const value = { ...keyOf(provider), ...change };
    checked.current[provider] = null;
    patch(provider, { ...change, status: "idle" });
    if (pasted) void check(provider, value);
  }

  function remove(provider: string) {
    checked.current[provider] = null;
    patch(provider, { apiKey: "", baseUrl: "", status: "idle", models: [] });
    const now = parseModels(readModelsRaw());
    writeModels({
      llm: now.llm?.provider === provider ? null : now.llm,
      stt: now.stt?.provider === provider ? null : now.stt,
    });
  }

  function chooseProvider(kind: ModelKind, provider: string) {
    setProviders((prev) => ({ ...prev, [kind]: provider }));
    // The task no longer runs on the old provider until a model is chosen.
    if (stored[kind] && stored[kind].provider !== provider) writeModels({ ...stored, [kind]: null });
  }

  function chooseModel(kind: ModelKind, model: string) {
    const provider = providers[kind];
    const k = keyOf(provider);
    writeModels({
      ...stored,
      [kind]: {
        provider,
        apiKey: k.apiKey.trim(),
        model,
        ...(provider === "custom" ? { baseUrl: k.baseUrl.trim() } : {}),
      },
    });
  }

  const usedProviders = [...new Set(KINDS.map((kind) => providers[kind]).filter(Boolean))];
  const labelOf = (provider: string) =>
    provider === "custom"
      ? "Your own server"
      : (config.providers.find((p) => p.id === provider)?.label ?? provider);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">{withoutKeyLine(config)}</p>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-medium">API keys</h2>
        {usedProviders.map((provider) => {
          const k = keyOf(provider);
          const isCustom = provider === "custom";
          const isStored = KINDS.some((kind) => stored[kind]?.provider === provider);
          const blur = () => void check(provider, keyOf(provider));
          const pasted = (e: FormEvent<HTMLInputElement>) =>
            (e.nativeEvent as InputEvent).inputType === "insertFromPaste";
          return (
            <div key={provider} className="flex flex-col gap-3">
              {isCustom && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-${provider}-url`} className="text-sm font-medium">
                    Server address
                  </label>
                  <Input
                    id={`${id}-${provider}-url`}
                    type="url"
                    value={k.baseUrl}
                    onChange={(e) => edit(provider, { baseUrl: e.target.value }, pasted(e))}
                    onBlur={blur}
                    placeholder="http://localhost:11434/v1"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={`${id}-${provider}-key`} className="flex items-center gap-2 text-sm font-medium">
                    <ProviderIcon provider={provider} className="size-4 shrink-0" />
                    {labelOf(provider)}
                    {isCustom && <span className="text-muted-foreground font-normal">(key if needed)</span>}
                  </label>
                  <KeyStatusText status={k.status} />
                </div>
                <div className="flex gap-2">
                  <Input
                    id={`${id}-${provider}-key`}
                    type="password"
                    value={k.apiKey}
                    onChange={(e) => edit(provider, { apiKey: e.target.value }, pasted(e))}
                    onBlur={blur}
                    placeholder="Paste your key"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {isStored && (
                    <Button type="button" variant="ghost" onClick={() => remove(provider)}>
                      Remove
                    </Button>
                  )}
                </div>
                <GetKeyLink provider={provider} label={labelOf(provider)} />
              </div>
            </div>
          );
        })}
      </section>

      {KINDS.map((kind) => {
        const options = providerOptions(config, kind);
        const provider = providers[kind];
        const k = keyOf(provider);
        const current = stored[kind]?.provider === provider ? stored[kind].model : "";
        const models = modelsFor(k.models, kind);
        if (current && !models.includes(current)) models.unshift(current);
        return (
          <section key={kind} className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-medium">{KIND_COPY[kind].name}</h2>
              <p className="text-muted-foreground text-xs">{KIND_COPY[kind].purpose}</p>
            </div>
            {options.length === 0 ? (
              <p className="text-muted-foreground text-sm">No provider offers this here yet.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-${kind}-provider`} className="text-sm font-medium">
                    Provider
                  </label>
                  <ProviderSelect
                    id={`${id}-${kind}-provider`}
                    options={options}
                    value={provider}
                    onChange={(v) => chooseProvider(kind, v)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-${kind}-model`} className="text-sm font-medium">
                    Model
                  </label>
                  <Select
                    value={current || null}
                    onValueChange={(v) => typeof v === "string" && chooseModel(kind, v)}
                    disabled={models.length === 0}
                  >
                    <SelectTrigger id={`${id}-${kind}-model`} className="w-full">
                      <SelectValue
                        placeholder={k.status === "valid" ? "Choose a model" : "Add your key above"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {kind === "llm" && <ModelInstructions config={config} />}
          </section>
        );
      })}
    </div>
  );
}

// Discreet, helper-text sized, announced to screen readers as it changes.
function KeyStatusText({ status }: { status: KeyStatus }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "text-xs",
        status === "invalid" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "checking" ? "Checking…" : status === "valid" ? "Valid" : status === "invalid" ? "Invalid key" : ""}
    </span>
  );
}

// The exact instructions each pass sends to the visitor's model: it is their
// key and their money, so nothing it is asked to do stays hidden. Closed by
// default, like the FAQ.
function ModelInstructions({ config }: { config: LlmConfig }) {
  return (
    <Accordion className="border-t pt-2">
      <AccordionItem value="instructions">
        <AccordionTrigger>What your model is told</AccordionTrigger>
        <AccordionContent>
      <dl className="mt-1 flex flex-col gap-4">
        {config.roles.map((role) => (
          <div key={role.id} className="flex flex-col gap-1.5">
            <dt className="text-xs font-medium">{role.label}</dt>
            <dd className="bg-muted text-muted-foreground rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {role.system_prompt}
            </dd>
          </div>
        ))}
      </dl>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// The AI models section of Settings: both kinds, for changing a model, replacing an expired key or
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
