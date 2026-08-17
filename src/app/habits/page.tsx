"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Insight } from "@/components/ui/Insight";
import { BulletList } from "@/components/ui/BulletList";
import { Methodology } from "@/components/ui/Methodology";
import { AdherenceStrip } from "@/components/charts/AdherenceStrip";
import { useDateRangeFilter } from "@/lib/useDateRangeFilter";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { habitsByCategory, habitsInsight, habitStats } from "@/lib/aggregations/habits";
import type { ItemStats } from "@/lib/aggregations/itemStats";
import { getItem, putItem, setUserOverride } from "@/lib/db/indexedDb";
import { pushItem, pushUserOverride } from "@/lib/supabase/sync";
import { normalizeName } from "@/taxonomy/normalizeName";
import type { OverrideEntry } from "@/taxonomy/classify";

const STRIP_WINDOW_DAYS = 90;

/** Rename + archive/unarchive — shared by every item row below. Archiving
 * only ever touches the item's own record (never its logs), so history
 * stays intact; renaming keeps the same identity and copies the item's
 * existing classification onto the new name via a user override, so a
 * rename can't accidentally reclassify it. */
function useHabitActions(refresh: () => Promise<void>) {
  const [busyIdentity, setBusyIdentity] = useState<string | null>(null);

  async function toggleArchive(item: ItemStats) {
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, isArchived: !existing.isArchived };
      await putItem(updated);
      void pushItem(updated);
    }
    await refresh();
    setBusyIdentity(null);
  }

  async function rename(item: ItemStats, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === item.item) return;
    setBusyIdentity(item.itemIdentity);
    const existing = await getItem(item.itemIdentity);
    if (existing) {
      const updated = { ...existing, rawName: trimmed };
      await putItem(updated);
      void pushItem(updated);
    }
    const key = normalizeName(trimmed);
    const override: OverrideEntry = {
      canonicalName: trimmed,
      itemType: "habit",
      category: item.category,
      subcategory: item.subcategory,
    };
    await setUserOverride(key, override);
    void pushUserOverride(key, override);
    await refresh();
    setBusyIdentity(null);
  }

  return { busyIdentity, toggleArchive, rename };
}

function ItemActions({
  item,
  busy,
  onArchiveToggle,
  onRename,
}: {
  item: ItemStats;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.item);

  if (editing) {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setEditing(false);
          onRename(name);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="submit" className="text-xs font-medium" style={{ color: "var(--status-good)" }}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {item.item}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy}
        className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onArchiveToggle}
        disabled={busy}
        className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        {item.isArchived ? "Unarchive" : "Archive"}
      </button>
    </span>
  );
}

export default function HabitsPage() {
  const { status, events, refresh } = useData();
  const { span, range, setRange, filtered } = useDateRangeFilter(events);
  const { busyIdentity, toggleArchive, rename } = useHabitActions(refresh);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // The insight always reads the full history (recent-vs-usual needs a
  // stable baseline) — independent of whatever range the detail charts
  // below are filtered to.
  const insight = useMemo(() => habitsInsight(events), [events]);
  const allStats = useMemo(() => habitStats(filtered), [filtered]);
  const groups = useMemo(
    () =>
      habitsByCategory(filtered)
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.isArchived) }))
        .filter((g) => g.items.length > 0),
    [filtered],
  );
  const archived = useMemo(() => allStats.filter((i) => i.isArchived), [allStats]);

  if (status === "loading") return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty") return <EmptyState />;

  const stripEnd = range?.end ?? span?.end ?? "";
  const stripStart = stripEnd ? addDaysToDate(stripEnd, -(STRIP_WINDOW_DAYS - 1)) : "";
  const clampedStripStart = span && stripStart < span.start ? span.start : stripStart;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Habits
      </h1>

      <Insight label="What changed" headline={insight.headline} detail={insight.detail} tone="neutral" />

      {!insight.insufficientData && insight.changed.length > 0 && (
        <BulletList title="Running differently than usual" tone="var(--text-muted)" bullets={insight.changed} />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Details
        </p>
        {span && range && <DateRangeFilter span={span} value={range} onChange={setRange} />}
      </div>

      {groups.map((group) => (
        <Card key={group.category} tier="raw">
          <CardTitle size="sm" subtitle={`${group.items.length} item${group.items.length === 1 ? "" : "s"}`}>
            {group.category}
          </CardTitle>
          <div className="flex flex-col gap-4">
            {group.items.map((item) => (
              <div
                key={item.itemIdentity}
                className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0"
                style={{ borderColor: "var(--gridline)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <ItemActions
                    item={item}
                    busy={busyIdentity === item.itemIdentity}
                    onArchiveToggle={() => void toggleArchive(item)}
                    onRename={(newName) => void rename(item, newName)}
                  />
                  <span className="flex gap-4 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.consistencyPct}%</strong> consistency
                    </span>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.currentStreak}</strong> current streak
                    </span>
                    <span>
                      <strong style={{ color: "var(--text-primary)" }}>{item.longestStreak}</strong> longest streak
                    </span>
                    <span>
                      {item.daysCompleted}/{item.daysTracked} days
                    </span>
                  </span>
                </div>
                {clampedStripStart && (
                  <AdherenceStrip
                    startDate={clampedStripStart}
                    endDate={stripEnd}
                    stateByDate={buildStateByDate(filtered, item.item)}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {archived.length > 0 && (
        <Card tier="raw">
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Archived ({archived.length})
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {archivedOpen ? "Hide" : "Show"}
            </span>
          </button>
          {archivedOpen && (
            <ul className="mt-3 flex flex-col gap-2">
              {archived.map((item) => (
                <li
                  key={item.itemIdentity}
                  className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
                  style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
                >
                  {item.item}
                  <button
                    type="button"
                    onClick={() => void toggleArchive(item)}
                    disabled={busyIdentity === item.itemIdentity}
                    className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Unarchive
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Methodology>
        This compares each habit&apos;s consistency over the last 14 tracked days against its own overall
        consistency since it was first logged — never a fixed target, and never a judgment of whether that&apos;s
        good. A habit needs at least 10 overall tracked days and 5 recent tracked days before it&apos;s described
        either way; below that it&apos;s left out rather than guessed at. Archiving a habit only hides it from new
        logging — its full history stays in every chart and comparison here and elsewhere in the app.
      </Methodology>
    </div>
  );
}
