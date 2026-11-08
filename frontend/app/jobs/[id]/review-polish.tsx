import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { providerLabel, type StoredEndpoint } from "@/lib/model-keys";
import { cn, plural } from "@/lib/utils";
import { costLabel, formatUsd, isPolishOn, polishRoleIds, type Cost } from "@/lib/review";
import { type LlmConfig } from "@/lib/api";

interface RoleSelectorProps {
  llm: LlmConfig;
  // Opens the connect dialog. The panel always renders: with no model, this
  // takes the switch's place.
  onConnect: () => void;
  browserModel: StoredEndpoint | null;
  selectedRoles: Set<string>;
  onToggleRole: (id: string) => void;
  onSetRolesMany: (ids: string[], value: boolean) => void;
  unpunctuatedSelected: number;
}

// AI polish, the one paid path, presented as a single master switch: on engages
// the default set (the roles whose tier is "default": punctuation and a copyedit
// pass), off clears every optional pass. The extras that invent structure or
// generate text (sections, preface) appear under the switch once it is on,
// opt-in one by one.
// Roles are grouped by their backend `tier` so the ids stay out of the UI.
// Always rendered: with no model available, "Connect a model" stands where the
// switch would be, quiet rather than gold, so the free path stays the default.
export function RoleSelector({
  llm,
  onConnect,
  browserModel,
  selectedRoles,
  onToggleRole,
  onSetRolesMany,
  unpunctuatedSelected,
}: RoleSelectorProps) {
  const defaultIds = polishRoleIds(llm);
  const extraRoles = llm.roles.filter((r) => r.tier === "extra");
  const extraIds = extraRoles.map((r) => r.id);

  const masterOn = isPolishOn(llm, selectedRoles);

  function setMaster(on: boolean) {
    if (on) onSetRolesMany(defaultIds, true);
    else onSetRolesMany([...defaultIds, ...extraIds], false);
  }

  const runsOn = browserModel
    ? browserModel.provider === "custom"
      ? "Runs on your own server. "
      : `Runs on your ${providerLabel(llm, browserModel.provider)} key. `
    : "";
  // What the switch does, never the problem again: the rows already say which
  // captions read raw. Its reach is a count, so you know what it would touch.
  const reach =
    unpunctuatedSelected > 0
      ? ` Applies to ${plural(unpunctuatedSelected, "source")} with raw captions.`
      : "";
  const what = !llm.available
    ? "Your own AI model can punctuate and lightly copyedit the text. Without one, it stays exactly as retrieved."
    : masterOn
      ? `Adds missing punctuation and a light copyedit.${reach}`
      : `Punctuates raw captions into paragraphs and lightly copyedits.${reach}`;

  // A section of the pane like the others, not a card: a name and its switch,
  // one sentence, then the extras and whose model it runs on.
  return (
    <section aria-labelledby="ai-polish" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id="ai-polish" className="text-sm font-medium">
          AI polish
        </h3>
        {llm.available && (
          <Switch checked={masterOn} onCheckedChange={setMaster} aria-labelledby="ai-polish" />
        )}
      </div>
      <p className="text-muted-foreground text-sm">{what}</p>

      {!llm.available ? (
        <Button type="button" variant="outline" size="sm" onClick={onConnect} className="self-start">
          Connect a model
        </Button>
      ) : (
        <>
          {masterOn && extraRoles.length > 0 && (
            <ul className="flex flex-col">
              {extraRoles.map((role) => (
                <li key={role.id}>
                  <label className="hover:bg-muted/50 -mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors">
                    <Checkbox
                      checked={selectedRoles.has(role.id)}
                      onCheckedChange={() => onToggleRole(role.id)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm leading-none font-medium">{role.label}</span>
                      <span className="text-muted-foreground text-xs">{role.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {/* Always a way to bring (or change) your own key from here, even
              when the server has a model of its own. */}
          <p className="text-muted-foreground text-xs">
            {runsOn}
            <button type="button" onClick={onConnect} className="text-foreground text-link font-medium">
              {browserModel ? "Change model" : "Use your own key"}
            </button>
          </p>
        </>
      )}
    </section>
  );
}

export function CostEstimate({ cost }: { cost: Cost }) {
  const parts: string[] = [];
  if (cost.stt > 0) parts.push(`Transcription ${formatUsd(cost.stt)}`);
  if (cost.llm > 0) parts.push(`AI polish ${formatUsd(cost.llm)}`);

  // "Free" is the headline, not a blank line: when nothing is metered, say so.
  // It's the zero-LLM promise paying off, worth affirming at the decision point.
  // A metered total wears the warning tone, with what it pays for under it.
  const label = costLabel(cost);

  return (
    <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span>Estimated cost</span>
        <span className={cn("font-medium tabular-nums", label && "text-warning")}>
          {label ?? "Free"}
        </span>
      </div>
      {label && (
        <span className="text-right tabular-nums">{parts.join(" · ")}</span>
      )}
    </div>
  );
}
