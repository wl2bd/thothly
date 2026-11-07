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
import { ApiError, fetchLlmConfig, verifyKey, type LlmConfig } from "@/lib/api";
import {
  maskKey,
  parseModels,
  providerLabel,
  readModelsRaw,
  writeModels,
  type StoredEndpoint,
} from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";

export type ModelKind = "llm" | "stt";

const KIND_COPY: Record<ModelKind, { name: string; title: string; purpose: string }> = {
  llm: {
    name: "Text model",
    title: "Connect a model",
    purpose: "Runs AI polish: punctuates and tidies transcripts and articles.",
  },
  stt: {
    name: "Transcription",
    title: "Connect transcription",
    purpose: "Only for podcast episodes that come without a transcript.",
  },
};

export const PRIVACY =
  "Your key stays in this browser. Thothly sends it to your provider only to check it and to run a compilation you start, and never stores it.";

// The stored endpoint for one kind: a summary with Replace and Remove once a key
// is saved, the connect form otherwise. Used by the review screen's connect step;
// Settings lays the same key field and key check out per provider.
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
    const label = providerLabel(config, current.provider);
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
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
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

const TRANSCRIPTION_MODEL = /whisper|voxtral|transcri|scribe/i;
function providerOptions(config: LlmConfig, kind: ModelKind) {
  return [
    ...config.providers
      .filter((p) => (kind === "llm" ? p.llm_per_mtok_in != null : p.stt_per_minute != null))
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
  const keyCheck = useKeyCheck((_, outcome) => {
    setStatus(outcome.status);
    if (outcome.models) setModels(outcome.status === "valid" ? modelsFor(outcome.models, kind) : null);
  });

  const isCustom = provider === "custom";

  // Any change to what was checked invalidates the check.
  function reset() {
    setModels(null);
    setModel("");
    setStatus("idle");
    keyCheck.invalidate(id);
  }

  // Runs on paste and on blur, with the field's value at that moment.
  const check = (value: KeyValue) => void keyCheck.check(id, provider, value);

  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">No provider offers this here yet.</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        check({ apiKey, baseUrl });
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
          onChange={(v) => {
            setProvider(v);
            reset();
          }}
        />
      </div>

      <KeyField
        idPrefix={id}
        provider={provider}
        providerName={providerLabel(config, provider)}
        keyName="API key"
        optionalHint="(if your server needs one)"
        placeholder={initial ? `Replacing ${maskKey(initial.apiKey)}` : "Paste your key"}
        value={{ apiKey, baseUrl }}
        status={status}
        onChange={(change, wasPasted) => {
          if (change.apiKey !== undefined) setApiKey(change.apiKey);
          if (change.baseUrl !== undefined) setBaseUrl(change.baseUrl);
          reset();
          if (wasPasted) check({ apiKey, baseUrl, ...change });
        }}
        onBlur={() => check({ apiKey, baseUrl })}
      />

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
  // Braces: recent Chrome returns a Promise from scrollIntoView, which React
  // would take for the effect's cleanup and call on unmount.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
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
const NOT_TEXT_MODEL = new RegExp(
  `${TRANSCRIPTION_MODEL.source}|tts|speech|audio|realtime|embed|moderation|image|dall-e`,
  "i",
);

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
  if (config.available) return "Without a key, Thothly uses its default text model. Podcast episodes without a transcript are skipped.";
  if (config.stt_available) return "Without a key, Thothly uses its default transcription model. AI polish needs a key.";
  return "Without a key, compilations are free: transcripts and articles stay as they are, and podcast episodes without a transcript are skipped.";
}

// "unreachable": the provider or this server didn't answer, which says nothing
// about the key.
type KeyStatus = "idle" | "checking" | "valid" | "invalid" | "unreachable";

// One key check, through the backend (providers refuse browser calls): the
// models it grants, or why there are none.
async function checkKey(
  provider: string,
  apiKey: string,
  baseUrl: string,
): Promise<{ status: "valid"; models: string[] } | { status: "invalid" | "unreachable" }> {
  try {
    const models = await verifyKey(provider, apiKey, provider === "custom" ? baseUrl : undefined);
    return { status: "valid", models };
  } catch (err) {
    const refused = err instanceof ApiError && err.status >= 400 && err.status < 500;
    return { status: refused ? "invalid" : "unreachable" };
  }
}

interface ProviderKey {
  apiKey: string;
  baseUrl: string;
  status: KeyStatus;
  models: string[];
}

const KINDS = ["llm", "stt"] as const;
const signature = (k: { apiKey: string; baseUrl: string }) => `${k.apiKey.trim()}\n${k.baseUrl.trim()}`;

// A paste checks the key at once; typing waits for the field to lose focus.
const pasted = (e: FormEvent<HTMLInputElement>) =>
  (e.nativeEvent as InputEvent).inputType === "insertFromPaste";

interface KeyValue {
  apiKey: string;
  baseUrl: string;
}

// What a check reports: `models` arrives with the final answer only.
interface KeyOutcome {
  status: KeyStatus;
  models?: string[];
}

// Key checks for one or several fields (`id` names the field). It remembers the
// key + address each field's status is about, so an answer to a key that has
// since been edited is dropped. `onResult` is called with "checking", then with
// the answer.
function useKeyCheck(onResult: (id: string, outcome: KeyOutcome, value: KeyValue) => void) {
  // Written only in handlers, so a check started from an edit sees it at once.
  const checked = useRef<Record<string, string | null>>({});

  // `again` re-checks a value that was already checked.
  async function check(id: string, provider: string, value: KeyValue, again = false) {
    const apiKey = value.apiKey.trim();
    const baseUrl = value.baseUrl.trim();
    if (provider === "custom" ? !baseUrl : !apiKey) {
      checked.current[id] = null;
      return onResult(id, { status: "idle" }, value);
    }
    const sig = signature(value);
    if (!again && checked.current[id] === sig) return;
    checked.current[id] = sig;
    onResult(id, { status: "checking" }, value);
    const result = await checkKey(provider, apiKey, baseUrl);
    if (checked.current[id] !== sig) return;
    onResult(
      id,
      result.status === "valid" ? { status: "valid", models: result.models } : { status: result.status, models: [] },
      value,
    );
  }

  // Any change to what was checked invalidates the check.
  function invalidate(id: string) {
    checked.current[id] = null;
  }

  return { check, invalidate };
}

// The address (own server only) and key inputs of one provider, with the check
// status and the link to get a key. The caller owns the values and the checking.
function KeyField({
  idPrefix,
  provider,
  providerName,
  keyName,
  optionalHint,
  placeholder,
  value,
  status,
  onChange,
  onBlur,
  onRemove,
}: {
  idPrefix: string;
  provider: string;
  providerName: string;
  keyName: string;
  optionalHint: string;
  placeholder: string;
  value: KeyValue;
  status: KeyStatus;
  onChange: (change: Partial<KeyValue>, pasted: boolean) => void;
  onBlur: () => void;
  onRemove?: () => void;
}) {
  const isCustom = provider === "custom";
  return (
    <>
      {isCustom && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-url`} className="text-sm font-medium">
            Server address
          </label>
          <Input
            id={`${idPrefix}-url`}
            type="url"
            value={value.baseUrl}
            onChange={(e) => onChange({ baseUrl: e.target.value }, pasted(e))}
            onBlur={onBlur}
            placeholder="http://localhost:11434/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${idPrefix}-key`} className="text-sm font-medium">
            {keyName}
            {isCustom && <span className="text-muted-foreground font-normal"> {optionalHint}</span>}
          </label>
          <KeyStatusText status={status} />
        </div>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-key`}
            type="password"
            value={value.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value }, pasted(e))}
            onBlur={onBlur}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          {onRemove && (
            <Button type="button" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
        <GetKeyLink provider={provider} label={providerName} />
      </div>
    </>
  );
}

// Settings: a key belongs to a provider and is entered once; each task picks a
// provider and one of its models. Transcription follows the text model's
// provider when that provider can transcribe, so one key covers both; its own
// key field shows only once another provider is picked. Storage keeps one full
// endpoint per task (lib/model-keys.ts), so the backend sees the same shape.
export function ModelSettingsSections({ config }: { config: LlmConfig }) {
  const id = useId();
  const stored = useStoredModels();
  const [llmProvider, setLlmProvider] = useState(
    () => stored.llm?.provider ?? providerOptions(config, "llm")[0]?.value ?? "",
  );
  // null: follow the text model's provider.
  const [sttChoice, setSttChoice] = useState<string | null>(() => stored.stt?.provider ?? null);
  const sttOptions = providerOptions(config, "stt");
  const sttProvider =
    sttChoice ??
    (sttOptions.some((o) => o.value === llmProvider) ? llmProvider : (sttOptions[0]?.value ?? ""));
  const providers: Record<ModelKind, string> = { llm: llmProvider, stt: sttProvider };
  const [keys, setKeys] = useState<Record<string, ProviderKey>>(() => {
    const init: Record<string, ProviderKey> = {};
    for (const e of [stored.llm, stored.stt]) {
      if (e) init[e.provider] = { apiKey: e.apiKey, baseUrl: e.baseUrl ?? "", status: "checking", models: [] };
    }
    return init;
  });
  // One key check per provider.
  const keyCheck = useKeyCheck((provider, outcome, value) => {
    patch(provider, { status: outcome.status, ...(outcome.models ? { models: outcome.models } : {}) });
    if (outcome.status === "valid") adoptKey(provider, value);
  });

  const keyOf = (provider: string): ProviderKey =>
    keys[provider] ?? { apiKey: "", baseUrl: "", status: "idle", models: [] };

  function patch(provider: string, change: Partial<ProviderKey>) {
    setKeys((prev) => ({ ...prev, [provider]: { ...keyOf(provider), ...prev[provider], ...change } }));
  }

  // A new valid key replaces the old one on every task that uses the provider.
  function adoptKey(provider: string, value: KeyValue) {
    const apiKey = value.apiKey.trim();
    const baseUrl = value.baseUrl.trim();
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
    for (const [provider, k] of Object.entries(keys)) void keyCheck.check(provider, provider, k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit(provider: string, change: Partial<ProviderKey>, pasted: boolean) {
    const value = { ...keyOf(provider), ...change };
    keyCheck.invalidate(provider);
    patch(provider, { ...change, status: "idle" });
    if (pasted) void keyCheck.check(provider, provider, value);
  }

  function remove(provider: string) {
    keyCheck.invalidate(provider);
    patch(provider, { apiKey: "", baseUrl: "", status: "idle", models: [] });
    const now = parseModels(readModelsRaw());
    writeModels({
      llm: now.llm?.provider === provider ? null : now.llm,
      stt: now.stt?.provider === provider ? null : now.stt,
    });
  }

  function chooseProvider(kind: ModelKind, provider: string) {
    if (kind === "llm") setLlmProvider(provider);
    else setSttChoice(provider);
    // The task no longer runs on the old provider until a model is chosen.
    if (stored[kind] && stored[kind].provider !== provider) writeModels({ ...stored, [kind]: null });
  }

  function chooseModel(kind: ModelKind, model: string) {
    const provider = providers[kind];
    const k = keyOf(provider);
    // Once transcription has a model, it stays on that provider.
    if (kind === "stt") setSttChoice(provider);
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

  const labelOf = (provider: string) => providerLabel(config, provider);

  // A provider's key, entered once whichever task uses it.
  function keyField(provider: string) {
    const k = keyOf(provider);
    const isStored = KINDS.some((kind) => stored[kind]?.provider === provider);
    return (
      <div className="flex flex-col gap-3">
        <KeyField
          idPrefix={`${id}-${provider}`}
          provider={provider}
          providerName={labelOf(provider)}
          keyName={`${labelOf(provider)} key`}
          optionalHint="(if needed)"
          placeholder="Paste your key"
          value={k}
          status={k.status}
          onChange={(change, wasPasted) => edit(provider, change, wasPasted)}
          onBlur={() => void keyCheck.check(provider, provider, keyOf(provider))}
          onRemove={isStored ? () => remove(provider) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm">{withoutKeyLine(config)}</p>

      {KINDS.map((kind) => {
        const options = providerOptions(config, kind);
        const provider = providers[kind];
        const k = keyOf(provider);
        const current = stored[kind]?.provider === provider ? stored[kind].model : "";
        const models = modelsFor(k.models, kind);
        if (current && !models.includes(current)) models.unshift(current);
        const sharesKey = kind === "stt" && provider === llmProvider;
        return (
          <section key={kind} className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="flex items-baseline gap-2 text-base font-medium">
                {KIND_COPY[kind].name}
                {kind === "stt" && <span className="text-muted-foreground text-xs font-normal">Optional</span>}
              </h2>
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
                  {sharesKey && (
                    <p className="text-muted-foreground text-xs">Uses your {labelOf(provider)} key from above.</p>
                  )}
                </div>
                {!sharesKey && keyField(provider)}
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
                        placeholder={k.status === "valid" ? "Choose a model" : "Add your key first"}
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
          </section>
        );
      })}
      <ModelInstructions config={config} />
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
        status === "invalid" || status === "unreachable" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {
        {
          idle: "",
          checking: "Checking…",
          valid: "Valid",
          invalid: "Invalid key",
          unreachable: "Couldn't check it. Try again.",
        }[status]
      }
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
