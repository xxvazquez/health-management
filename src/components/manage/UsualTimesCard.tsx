"use client";

import { CollapsibleManageCard } from "@/components/manage/ManageSection";
import { FormGroup } from "@/components/ui/FormGroup";
import { TimePicker } from "@/components/ui/DatePicker";
import { DEFAULT_SLOT_TIMES } from "@/lib/logCandidates";
import { usePreferences } from "@/lib/usePreferences";

const GROUPS = [
  { title: "Meals", slots: ["Breakfast", "Lunch", "Snack", "Dinner"] },
  { title: "Supplements", slots: ["Morning", "Afternoon", "Night"] },
];

/** Settings → Usual times: when each meal and supplement time of day
 * usually happens, so an entry logged later lands at that time. */
export function UsualTimesCard({ searchQuery }: { searchQuery: string }) {
  const { prefs, update } = usePreferences();
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !`usual times meals ${Object.keys(DEFAULT_SLOT_TIMES).join(" ")}`.toLowerCase().includes(query)) return null;

  const times = { ...DEFAULT_SLOT_TIMES, ...prefs.slotTimes };

  function setTime(slot: string, time: string) {
    const next = { ...prefs.slotTimes };
    if (!time || time === DEFAULT_SLOT_TIMES[slot]) delete next[slot];
    else next[slot] = time;
    update({ slotTimes: next });
  }

  return (
    <CollapsibleManageCard title="Usual times" forceOpen={isSearching} bare>
      {GROUPS.map((group, i) => (
        <FormGroup key={group.title} title={group.title} footer={i === GROUPS.length - 1 ? "Used when you log something later, or for another day." : undefined}>
          {group.slots.map((slot) => (
            <div key={slot} className="flex min-h-11 items-center justify-between gap-3 px-3.5">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                {slot}
              </span>
              <TimePicker value={times[slot]} onChange={(t) => setTime(slot, t)} ariaLabel={`Usual time for ${slot}`} title={slot} />
            </div>
          ))}
        </FormGroup>
      ))}
    </CollapsibleManageCard>
  );
}
