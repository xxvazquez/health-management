"use client";

import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
import { CheckIcon, UpDownChevronIcon } from "@/components/ui/icons";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { usePreferences } from "@/lib/usePreferences";
import {
  DIETS,
  DIET_DEFAULTS,
  DIET_LABEL,
  MAX_TARGET_PER_WEEK,
  TARGET_GROUPS,
  TARGET_LABEL,
  dietOf,
  resolveAllFoodTargets,
  type Diet,
  type TargetGroup,
  type TargetMode,
} from "@/lib/foodTargets";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const CAPTION_CLS = "px-4 text-xs font-semibold tracking-wide uppercase";

const MODE_LABEL: Record<TargetMode, string> = { min: "At least", max: "At most", off: "Off" };

/** Settings → Food targets: a diet as a starting point, then every food
 * group with its own goal — at least or at most so many meals a week, or
 * off — which Trends → Food measures against. */
export function FoodTargetsCard({ searchQuery }: { searchQuery: string }) {
  const { prefs, update } = usePreferences();
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

  function setGroup(group: TargetGroup, mode: TargetMode, perWeek: number) {
    // A group switched on from 0 starts at once a week.
    const value = mode !== "off" && perWeek === 0 ? 1 : perWeek;
    update({ foodTargets: { diet, groups: { ...pref?.groups, ...legacyAsGroups(), [group]: { mode, perWeek: value } } } });
  }

  // Carries targets saved in the older numbers-only shape into `groups`.
  function legacyAsGroups() {
    if (!pref?.perWeek) return {};
    const out: Partial<Record<TargetGroup, { mode: TargetMode; perWeek: number }>> = {};
    for (const g of Object.keys(pref.perWeek) as TargetGroup[]) if (!pref.groups?.[g]) out[g] = all[g];
    return out;
  }

  const onCount = TARGET_GROUPS.filter((g) => all[g].mode !== "off").length;

  return (
    <CollapsibleManageCard title="Food targets" subtitle={`${DIET_LABEL[diet]}${customised ? ", custom" : ""} · ${onCount} on`} forceOpen={isSearching} bare>
      <div className="flex flex-col gap-1.5">
        <h3 className={CAPTION_CLS} style={{ color: "var(--text-muted)" }}>
          Diet
        </h3>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {DIETS.map((d) => (
            <button key={d} type="button" onClick={() => setDiet(d)} aria-pressed={d === diet} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
              <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {DIET_LABEL[d]}
              </span>
              {d === diet && (
                <span aria-hidden="true" style={{ color: "var(--ui-accent)" }}>
                  <CheckIcon size={14} />
                </span>
              )}
            </button>
          ))}
        </div>
        <GroupNote>A starting point. Choosing a diet resets every group below to its defaults.</GroupNote>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className={CAPTION_CLS} style={{ color: "var(--text-muted)" }}>
          Meals a week
        </h3>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {TARGET_GROUPS.map((group) => {
            const t = all[group];
            return (
              <div key={group} className="flex min-h-11 items-center gap-2 px-3.5 py-1.5">
                <span className="min-w-0 flex-1 text-sm" style={{ color: t.mode === "off" ? "var(--text-muted)" : "var(--text-primary)" }}>
                  {TARGET_LABEL[group]}
                </span>
                <label className="hit-slop relative inline-flex shrink-0 items-center gap-1 text-sm" style={{ color: t.mode === "off" ? "var(--text-muted)" : TYPE_ACCENT.food }}>
                  {MODE_LABEL[t.mode]}
                  <UpDownChevronIcon size={11} />
                  <select
                    value={t.mode}
                    onChange={(e) => setGroup(group, e.target.value as TargetMode, t.perWeek)}
                    aria-label={`${TARGET_LABEL[group]} goal`}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  >
                    {(Object.keys(MODE_LABEL) as TargetMode[]).map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
                {t.mode !== "off" && (
                  <NumberStepper
                    value={t.perWeek}
                    onChange={(v) => setGroup(group, t.mode, v)}
                    unit={` meals a week with ${TARGET_LABEL[group].toLowerCase()}`}
                    accent={TYPE_ACCENT.food}
                    step={1}
                    min={1}
                    max={MAX_TARGET_PER_WEEK}
                    compact
                    format={(v) => String(v)}
                  />
                )}
              </div>
            );
          })}
          {customised && (
            <button
              type="button"
              onClick={() => setDiet(diet)}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium"
              style={{ color: "var(--ui-accent)" }}
            >
              Reset to {DIET_LABEL[diet].toLowerCase()} defaults
            </button>
          )}
        </div>
        <GroupNote>
          Trends → Food counts every meal (breakfast, lunch, dinner or snack) that included something from a group, so vegetables at lunch and
          dinner every day make 14 a week. Healthy fats means olive oil, rapeseed oil and avocado; ultra-processed covers sweets, cake and
          crisps. At least: a goal to reach. At most: a limit to stay under. Off: not measured.
        </GroupNote>
      </div>
    </CollapsibleManageCard>
  );
}
