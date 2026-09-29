"use client";

import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
import { CheckIcon } from "@/components/ui/icons";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { usePreferences } from "@/lib/usePreferences";
import {
  DIETS,
  DIET_DEFAULTS,
  DIET_LABEL,
  MAX_TARGET_PER_WEEK,
  TARGET_PILLARS,
  dietOf,
  resolveFoodTargets,
  targetLabel,
  type Diet,
  type TargetPillar,
} from "@/lib/foodTargets";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const CAPTION_CLS = "px-4 text-xs font-semibold tracking-wide uppercase";

/** Settings → Food targets: a diet that sets sensible defaults, then each
 * food group's times-a-week target, which Trends → Food judges against. */
export function FoodTargetsCard({ searchQuery }: { searchQuery: string }) {
  const { prefs, update } = usePreferences();
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !"food targets diet vegetarian vegan pescatarian".includes(query)) return null;

  const pref = prefs.foodTargets;
  const diet = dietOf(pref);
  const resolved = resolveFoodTargets(pref);
  const customised = TARGET_PILLARS.some((p) => (resolved[p] ?? 0) !== DIET_DEFAULTS[diet][p]);

  function setDiet(next: Diet) {
    update({ foodTargets: { diet: next } });
  }

  function setTarget(pillar: TargetPillar, value: number) {
    update({ foodTargets: { diet, perWeek: { ...pref?.perWeek, [pillar]: value } } });
  }

  return (
    <CollapsibleManageCard title="Food targets" subtitle={customised ? `${DIET_LABEL[diet]}, custom` : DIET_LABEL[diet]} forceOpen={isSearching} bare>
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
        <GroupNote>Choosing a diet resets the targets below to its defaults.</GroupNote>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className={CAPTION_CLS} style={{ color: "var(--text-muted)" }}>
          Times a week
        </h3>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {TARGET_PILLARS.map((pillar) => (
            <div key={pillar} className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {targetLabel(pillar)}
              </span>
              <NumberStepper
                value={resolved[pillar] ?? 0}
                onChange={(v) => setTarget(pillar, v)}
                unit={` ${targetLabel(pillar)} a week`}
                accent={TYPE_ACCENT.food}
                step={1}
                min={0}
                max={MAX_TARGET_PER_WEEK}
                compact
                format={(v) => (v === 0 ? "Off" : `${v} a week`)}
              />
            </div>
          ))}
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
        <GroupNote>Trends → Food measures each group against these. Set one to Off to leave it out.</GroupNote>
      </div>
    </CollapsibleManageCard>
  );
}
