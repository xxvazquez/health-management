"use client";

import { useId, useState } from "react";
import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
import { ChevronIcon, UpDownChevronIcon } from "@/components/ui/icons";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { FormGroup } from "@/components/ui/FormGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { usePreferences } from "@/lib/usePreferences";
import {
  DIETS,
  DIET_DEFAULTS,
  DIET_LABEL,
  MAX_TARGET_PER_WEEK,
  TARGET_EXAMPLES,
  TARGET_GROUPS,
  TARGET_LABEL,
  dietOf,
  resolveAllFoodTargets,
  type Diet,
  type GroupTarget,
  type TargetGroup,
  type TargetMode,
} from "@/lib/foodTargets";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const CAPTION_CLS = "px-4 text-xs font-semibold tracking-wide uppercase";
const ACCENT = TYPE_ACCENT.food;

const SECTIONS: { mode: TargetMode; caption: string; footer?: string }[] = [
  { mode: "min", caption: "Goals", footer: "Meals a week that include each group." },
  { mode: "max", caption: "Limits" },
  { mode: "off", caption: "Not measured" },
];

/** Settings → Food targets, laid out like iOS Settings: the diet as a menu
 * row, then every food group under Goals, Limits or Not measured with its
 * weekly count, each opening a sheet to change it. */
export function FoodTargetsCard({ searchQuery }: { searchQuery: string }) {
  const { prefs, update } = usePreferences();
  const [editing, setEditing] = useState<TargetGroup | null>(null);
  const [pendingDiet, setPendingDiet] = useState<Diet | null>(null);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !`food targets diet vegetarian vegan pescatarian ${TARGET_GROUPS.map((g) => TARGET_LABEL[g]).join(" ")}`.toLowerCase().includes(query)) return null;

  const pref = prefs.foodTargets;
  const diet = dietOf(pref);
  const all = resolveAllFoodTargets(pref);
  const defaults = DIET_DEFAULTS[diet];
  const customised = TARGET_GROUPS.some((g) => all[g].mode !== defaults[g].mode || (all[g].mode !== "off" && all[g].perWeek !== defaults[g].perWeek));

  function setDiet(next: Diet) {
    update({ foodTargets: { diet: next } });
  }

  function chooseDiet(next: Diet) {
    if (next === diet) return;
    // Switching diet replaces every target, so confirm when some were changed by hand.
    if (customised) setPendingDiet(next);
    else setDiet(next);
  }

  function setGroup(group: TargetGroup, next: GroupTarget) {
    const perWeek = next.mode !== "off" && next.perWeek === 0 ? 1 : next.perWeek;
    const groups: Partial<Record<TargetGroup, GroupTarget>> = { ...pref?.groups };
    // Carries targets saved in the older numbers-only shape into `groups`.
    for (const g of Object.keys(pref?.perWeek ?? {}) as TargetGroup[]) groups[g] ??= all[g];
    groups[group] = { mode: next.mode, perWeek };
    update({ foodTargets: { diet, groups } });
  }

  const onCount = TARGET_GROUPS.filter((g) => all[g].mode !== "off").length;

  return (
    <CollapsibleManageCard title="Food targets" subtitle={`${DIET_LABEL[diet]} · ${onCount} on`} forceOpen={isSearching} bare>
      <div className="flex flex-col gap-1.5">
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <label className="relative flex min-h-11 items-center gap-3 px-3.5">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              Diet
            </span>
            <span className="flex items-center gap-1 text-sm" style={{ color: ACCENT }}>
              {DIET_LABEL[diet]}
              <UpDownChevronIcon size={11} />
            </span>
            <select
              value={diet}
              onChange={(e) => chooseDiet(e.target.value as Diet)}
              aria-label="Diet"
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            >
              {DIETS.map((d) => (
                <option key={d} value={d}>
                  {DIET_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <GroupNote>Choosing a diet sets every target to its defaults.</GroupNote>
      </div>

      {SECTIONS.map(({ mode, caption, footer }) => {
        const groups = TARGET_GROUPS.filter((g) => all[g].mode === mode);
        if (groups.length === 0) return null;
        return (
          <div key={mode} className="flex flex-col gap-1.5">
            <h3 className={CAPTION_CLS} style={{ color: "var(--text-muted)" }}>
              {caption}
            </h3>
            <div className={GROUP_CLS} style={GROUP_STYLE}>
              {groups.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setEditing(group)}
                  aria-haspopup="dialog"
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left"
                >
                  <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                    {TARGET_LABEL[group]}
                  </span>
                  {mode !== "off" && (
                    <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
                      {all[group].perWeek} a week
                    </span>
                  )}
                  <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                    <ChevronIcon dir="right" size={14} />
                  </span>
                </button>
              ))}
            </div>
            {footer && <GroupNote>{footer}</GroupNote>}
          </div>
        );
      })}

      {customised && (
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button type="button" onClick={() => setDiet(diet)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--ui-accent)" }}>
            Reset to {DIET_LABEL[diet].toLowerCase()} defaults
          </button>
        </div>
      )}

      {editing && <TargetSheet group={editing} target={all[editing]} onChange={(next) => setGroup(editing, next)} onClose={() => setEditing(null)} />}
      {pendingDiet && (
        <ConfirmDialog
          title={`Switch to ${DIET_LABEL[pendingDiet]}?`}
          message="Every target will be set to that diet's defaults, replacing the ones you changed."
          confirmLabel="Switch"
          onConfirm={() => {
            setDiet(pendingDiet);
            setPendingDiet(null);
          }}
          onClose={() => setPendingDiet(null)}
        />
      )}
    </CollapsibleManageCard>
  );
}

const MODE_OPTIONS = [
  ["min", "At least"],
  ["max", "At most"],
  ["off", "Off"],
] as const;

/** One group's target: goal, limit or off, and how many meals a week. */
function TargetSheet({ group, target, onChange, onClose }: { group: TargetGroup; target: GroupTarget; onChange: (next: GroupTarget) => void; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet title={TARGET_LABEL[group]} titleId={titleId} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Segmented fill value={target.mode} onChange={(mode) => onChange({ ...target, mode })} options={MODE_OPTIONS} accent={ACCENT} />
        {target.mode !== "off" && (
          <FormGroup footer={TARGET_EXAMPLES[group]}>
            <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                Meals a week
              </span>
              <NumberStepper
                value={target.perWeek}
                onChange={(perWeek) => onChange({ ...target, perWeek })}
                unit=" meals a week"
                accent={ACCENT}
                step={1}
                min={1}
                max={MAX_TARGET_PER_WEEK}
                compact
                format={(v) => String(v)}
              />
            </div>
          </FormGroup>
        )}
        {target.mode === "off" && (
          <p className="px-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Not measured on Trends. {TARGET_EXAMPLES[group]}
          </p>
        )}
      </div>
    </Sheet>
  );
}
