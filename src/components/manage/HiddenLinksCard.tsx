"use client";

import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote, useSectionMode } from "@/components/manage/ManageSection";
import { usePreferences } from "@/lib/usePreferences";

/** Settings → Hidden links: Trends → Patterns links marked "Not related",
 * each with an Unhide. Listed in Settings only once one has been hidden. */
export function HiddenLinksCard({ searchQuery }: { searchQuery: string }) {
  const { prefs, update } = usePreferences();
  const hidden = prefs.hiddenPatternLinks ?? [];
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  // Stays open after the last one is unhidden, rather than vanishing under the user.
  const mode = useSectionMode("Hidden links", isSearching);
  if (hidden.length === 0 && mode !== "detail") return null;
  if (isSearching && !"hidden links patterns not related".includes(query) && !hidden.some((l) => `${l.symptom} ${l.trigger}`.toLowerCase().includes(query))) {
    return null;
  }

  function unhide(index: number) {
    update({ hiddenPatternLinks: hidden.filter((_, i) => i !== index) });
  }

  return (
    <CollapsibleManageCard title="Hidden links" subtitle={String(hidden.length)} forceOpen={isSearching} bare>
      <div className="flex flex-col gap-1.5">
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          {hidden.map((link, i) => (
            <div key={`${link.symptom}\u0000${link.trigger}`} className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
              <span className="min-w-0 flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                {link.symptom} <span style={{ color: "var(--text-muted)" }}>and</span> {link.trigger}
              </span>
              <button type="button" onClick={() => unhide(i)} className="hit-slop shrink-0 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
                Unhide
              </button>
            </div>
          ))}
          {hidden.length === 0 && (
            <p className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-muted)" }}>
              No hidden links.
            </p>
          )}
        </div>
        <GroupNote>Links you marked as not related on Trends → Patterns. Unhide one to let it show again.</GroupNote>
      </div>
    </CollapsibleManageCard>
  );
}
