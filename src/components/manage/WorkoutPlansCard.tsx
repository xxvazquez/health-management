"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
import { FormGroup } from "@/components/ui/FormGroup";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { SwitchRow } from "@/components/ui/Switch";
import { ROW_INLINE_CLS, ROW_STYLE } from "@/components/ui/formField";
import { useLoggedValues } from "@/components/log/WorkoutPlanView";
import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote } from "@/components/manage/ManageSection";
import { getAllWorkoutLogs } from "@/lib/db/indexedDb";
import { buildDemoDataset } from "@/lib/demoData";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { useWorkoutPlans } from "@/lib/useWorkoutPlans";
import type { RawItem, RawWorkoutLog } from "@/lib/types";
import {
  WEEKDAY_SHORT,
  addDays,
  mondayOf,
  planCoversDate,
  planWeekIndex,
  plannedSetsForWeek,
  suggestBaseKg,
  type LoggedValues,
  type PlanAdjustMode,
  type WorkoutPlan,
} from "@/lib/workoutPlans";

const ACCENT = "var(--ui-accent)";

interface DraftSession {
  key: string;
  weekday: number;
  itemId: string;
  mode: PlanAdjustMode;
  amount: string;
}

/** The editor's working copy — numbers kept as the typed text until Save. */
interface Draft {
  id: string;
  isNew: boolean;
  name: string;
  startDate: string;
  weeks: string;
  gain: string;
  round: string;
  hold: boolean;
  active: boolean;
  lifts: { itemId: string; base: string }[];
  sessions: DraftSession[];
  createdDate: string;
}

function parseNum(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? NaN : Number(trimmed);
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function draftFromPlan(plan: WorkoutPlan): Draft {
  return {
    id: plan.id,
    isNew: false,
    name: plan.name,
    startDate: plan.startDate,
    weeks: plan.weeks === null ? "" : String(plan.weeks),
    gain: String(plan.weeklyGainKg),
    round: String(plan.roundToKg),
    hold: plan.holdOnMiss,
    active: plan.isActive,
    lifts: plan.lifts.map((l) => ({ itemId: l.itemId, base: String(l.baseKg) })),
    sessions: plan.sessions.map((s, i) => ({ key: `s${i}`, weekday: s.weekday, itemId: s.itemId, mode: s.mode, amount: String(s.amount) })),
    createdDate: plan.createdDate,
  };
}

function newDraft(today: string): Draft {
  return {
    id: crypto.randomUUID(),
    isNew: true,
    name: "",
    startDate: addDays(mondayOf(today), 7),
    weeks: "",
    gain: "2.5",
    round: "2.5",
    hold: true,
    active: true,
    lifts: [],
    sessions: [],
    createdDate: today,
  };
}

/** The draft as a plan, or the reason it can't be saved yet. */
function planFromDraft(d: Draft): { plan: WorkoutPlan } | { error: string } {
  if (!d.name.trim()) return { error: "Give the plan a name." };
  if (d.lifts.length === 0) return { error: "Add at least one lift." };
  const lifts = d.lifts.map((l) => ({ itemId: l.itemId, baseKg: parseNum(l.base) }));
  if (lifts.some((l) => !(l.baseKg > 0))) return { error: "Every lift needs this week's weight." };
  const sessions = d.sessions.filter((s) => d.lifts.some((l) => l.itemId === s.itemId)).map((s) => ({ weekday: s.weekday, itemId: s.itemId, mode: s.mode, amount: parseNum(s.amount) }));
  if (sessions.length === 0) return { error: "Put at least one lift on a day." };
  if (sessions.some((s) => !Number.isFinite(s.amount) || (s.mode === "percent" && s.amount <= 0))) return { error: "Every day's lift needs a +kg or % amount." };
  const weeks = d.weeks.trim() === "" ? null : parseNum(d.weeks);
  if (weeks !== null && !(Number.isInteger(weeks) && weeks > 0 && weeks < 1000)) return { error: "Length must be a whole number of weeks (or blank)." };
  const gain = d.gain.trim() === "" ? 0 : parseNum(d.gain);
  if (!Number.isFinite(gain)) return { error: "Weekly gain must be a number." };
  const round = parseNum(d.round);
  if (!(round > 0)) return { error: "Round to must be more than 0 kg." };
  return {
    plan: {
      id: d.id,
      name: d.name.trim(),
      startDate: d.startDate,
      weeks,
      weeklyGainKg: gain,
      roundToKg: round,
      holdOnMiss: d.hold,
      isActive: d.active,
      lifts,
      sessions,
      createdDate: d.createdDate,
    },
  };
}

function planSubtitle(plan: WorkoutPlan, today: string): string {
  const days = Array.from(new Set(plan.sessions.map((s) => s.weekday)))
    .sort()
    .map((w) => WEEKDAY_SHORT[w - 1])
    .join(", ");
  if (!plan.isActive) return "Paused";
  if (plan.startDate > today) return `Starts ${shortDate(plan.startDate)} · ${days}`;
  if (!planCoversDate(plan, today)) return "Finished";
  const week = planWeekIndex(plan, today) + 1;
  return `Week ${week}${plan.weeks !== null ? ` of ${plan.weeks}` : ""} · ${days}`;
}

/** Four weeks of targets from the plan's current (or first) week — what the
 * template actually works out to, with holds already applied to any week
 * that's finished. */
function Preview({ plan, today, logged, nameOf }: { plan: WorkoutPlan; today: string; logged: LoggedValues; nameOf: (id: string) => string }) {
  const firstMonday = plan.startDate > today ? plan.startDate : mondayOf(today);
  const weeks = [0, 1, 2, 3].map((i) => addDays(firstMonday, i * 7)).filter((monday) => planCoversDate(plan, monday));
  if (weeks.length === 0) return <p className="px-3.5 py-2.5 text-sm" style={{ color: "var(--text-muted)" }}>This plan has finished.</p>;
  return (
    <>
      {weeks.map((monday) => {
        const sets = plannedSetsForWeek(plan, monday, today, logged);
        const byDay = new Map<number, typeof sets>();
        for (const s of sets) byDay.set(s.weekday, [...(byDay.get(s.weekday) ?? []), s]);
        return (
          <div key={monday} className="flex flex-col gap-1 px-3.5 py-2.5">
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Week {planWeekIndex(plan, monday) + 1} · {shortDate(monday)}
            </p>
            {Array.from(byDay.entries()).map(([weekday, daySets]) => (
              <p key={weekday} className="text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                <span className="inline-block w-10" style={{ color: "var(--text-secondary)" }}>
                  {WEEKDAY_SHORT[weekday - 1]}
                </span>
                {daySets.map((s) => `${nameOf(s.itemId)} ${s.targetKg} kg`).join(" · ")}
              </p>
            ))}
          </div>
        );
      })}
    </>
  );
}

function PlanEditor({
  initial,
  items,
  logs,
  today,
  onCancel,
  onSave,
  onDelete,
}: {
  initial: Draft;
  items: RawItem[];
  logs: RawWorkoutLog[];
  today: string;
  onCancel: () => void;
  onSave: (plan: WorkoutPlan) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.identity, i])), [items]);
  const logged = useLoggedValues(logs, itemsById);
  const nameOf = (id: string) => itemsById.get(id)?.rawName ?? "Deleted exercise";
  const liftable = items.filter((i) => !i.isArchived && (i.unit ?? "kg") === "kg" && !d.lifts.some((l) => l.itemId === i.identity));
  const result = planFromDraft(d);
  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  function addLift(itemId: string) {
    const name = itemsById.get(itemId)?.rawName;
    const suggestion = suggestBaseKg(
      logs.filter((l) => l.exercise === name).map((l) => ({ date: l.date, value: l.weightKg })),
      today,
    );
    update({ lifts: [...d.lifts, { itemId, base: suggestion === null ? "" : String(suggestion) }] });
  }

  function removeLift(itemId: string) {
    update({ lifts: d.lifts.filter((l) => l.itemId !== itemId), sessions: d.sessions.filter((s) => s.itemId !== itemId) });
  }

  function addSession(weekday: number) {
    const onDay = new Set(d.sessions.filter((s) => s.weekday === weekday).map((s) => s.itemId));
    const lift = d.lifts.find((l) => !onDay.has(l.itemId)) ?? d.lifts[0];
    if (!lift) return;
    update({ sessions: [...d.sessions, { key: crypto.randomUUID(), weekday, itemId: lift.itemId, mode: "kg", amount: "0" }] });
  }

  function patchSession(key: string, patch: Partial<DraftSession>) {
    update({ sessions: d.sessions.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  }

  const thisMonday = mondayOf(today);
  const nextMonday = addDays(thisMonday, 7);

  return (
    <div className="flex flex-col gap-4">
      <FormGroup title="Plan">
        <Field label="Name" inline>
          <input value={d.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Squat 3x" maxLength={80} className={ROW_INLINE_CLS} style={ROW_STYLE} />
        </Field>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Starts
          </span>
          {d.isNew ? (
            <Segmented
              value={d.startDate === thisMonday ? "this" : "next"}
              onChange={(v) => update({ startDate: v === "this" ? thisMonday : nextMonday })}
              options={[
                ["this", `This week (${shortDate(thisMonday)})`],
                ["next", `Next week (${shortDate(nextMonday)})`],
              ]}
            />
          ) : (
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Mon {shortDate(d.startDate)}
            </span>
          )}
        </div>
        <Field label="Length (weeks)" inline>
          <input value={d.weeks} onChange={(e) => update({ weeks: e.target.value })} inputMode="numeric" placeholder="Ongoing" className={`${ROW_INLINE_CLS} tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label="Weekly gain (kg)" inline>
          <input value={d.gain} onChange={(e) => update({ gain: e.target.value })} inputMode="decimal" placeholder="2.5" className={`${ROW_INLINE_CLS} tabular-nums`} style={ROW_STYLE} />
        </Field>
        <Field label="Round to (kg)" inline>
          <input value={d.round} onChange={(e) => update({ round: e.target.value })} inputMode="decimal" placeholder="2.5" className={`${ROW_INLINE_CLS} tabular-nums`} style={ROW_STYLE} />
        </Field>
        <SwitchRow label="Hold weight after a missed week" on={d.hold} onChange={(hold) => update({ hold })} />
        {!d.isNew && <SwitchRow label="Active" on={d.active} onChange={(active) => update({ active })} />}
      </FormGroup>

      <FormGroup title="Lifts · this week's weight" footer="Each lift's base for week 1. Filled in from your heaviest set of the last 7 days. The weekly gain is added to it every week.">
        {d.lifts.map((lift) => (
          <div key={lift.itemId} className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              {nameOf(lift.itemId)}
            </span>
            <input
              value={lift.base}
              onChange={(e) => update({ lifts: d.lifts.map((l) => (l.itemId === lift.itemId ? { ...l, base: e.target.value } : l)) })}
              inputMode="decimal"
              placeholder="kg"
              aria-label={`${nameOf(lift.itemId)} base weight in kg`}
              className={`${ROW_INLINE_CLS} w-20 tabular-nums`}
              style={ROW_STYLE}
            />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              kg
            </span>
            <button type="button" onClick={() => removeLift(lift.itemId)} aria-label={`Remove ${nameOf(lift.itemId)}`} className="hit-slop" style={{ color: "var(--text-muted)" }}>
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
        {liftable.length > 0 ? (
          <label className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="text-sm" style={{ color: ACCENT }}>
              Add lift
            </span>
            <select
              value=""
              onChange={(e) => e.target.value && addLift(e.target.value)}
              className={`${ROW_INLINE_CLS} flex-1`}
              style={ROW_STYLE}
            >
              <option value="">Choose…</option>
              {liftable.map((i) => (
                <option key={i.identity} value={i.identity}>
                  {i.rawName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          d.lifts.length === 0 && (
            <p className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-muted)" }}>
              No kg exercises yet. Add one under Settings → Workout.
            </p>
          )
        )}
      </FormGroup>

      {d.lifts.length > 0 && (
        <FormGroup title="Week template" footer="+kg is added to the lift's base for that week (use a minus for a lighter day). % takes that share of it, e.g. 80% for a light day.">
          {WEEKDAY_SHORT.map((label, i) => {
            const weekday = i + 1;
            const daySessions = d.sessions.filter((s) => s.weekday === weekday);
            return (
              <div key={label} className="flex flex-col gap-1.5 px-3.5 py-2">
                <div className="flex min-h-8 items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {label}
                    {daySessions.length === 0 && (
                      <span className="ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
                        Rest
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => addSession(weekday)} className="min-h-8 text-sm font-medium" style={{ color: ACCENT }}>
                    Add lift
                  </button>
                </div>
                {daySessions.map((s) => (
                  <div key={s.key} className="flex flex-wrap items-center gap-2">
                    <select
                      value={s.itemId}
                      onChange={(e) => patchSession(s.key, { itemId: e.target.value })}
                      aria-label={`${label} exercise`}
                      className="min-h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-2 text-sm outline-none"
                      style={{ borderColor: "var(--border-hairline)", color: "var(--text-primary)" }}
                    >
                      {d.lifts.map((l) => (
                        <option key={l.itemId} value={l.itemId}>
                          {nameOf(l.itemId)}
                        </option>
                      ))}
                    </select>
                    <Segmented
                      value={s.mode}
                      onChange={(mode) => patchSession(s.key, { mode, amount: mode === "percent" ? "80" : "0" })}
                      options={[
                        ["kg", "+kg"],
                        ["percent", "%"],
                      ]}
                    />
                    <input
                      value={s.amount}
                      onChange={(e) => patchSession(s.key, { amount: e.target.value })}
                      inputMode="decimal"
                      aria-label={s.mode === "percent" ? `${label} percent of base` : `${label} kg added to base`}
                      className="min-h-9 w-16 rounded-lg border bg-transparent px-2 text-right text-sm tabular-nums outline-none"
                      style={{ borderColor: "var(--border-hairline)", color: "var(--text-primary)" }}
                    />
                    <button type="button" onClick={() => update({ sessions: d.sessions.filter((x) => x.key !== s.key) })} aria-label={`Remove from ${label}`} className="hit-slop" style={{ color: "var(--text-muted)" }}>
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </FormGroup>
      )}

      {"plan" in result && (
        <FormGroup title="Preview">
          <Preview plan={result.plan} today={today} logged={logged} nameOf={nameOf} />
        </FormGroup>
      )}

      {showErrors && "error" in result && (
        <p className="px-3.5 text-sm" style={{ color: "var(--status-warning)" }}>
          {result.error}
        </p>
      )}

      <div className={GROUP_CLS} style={GROUP_STYLE}>
        <div className="flex min-h-11 items-center justify-between px-3.5">
          <button type="button" onClick={onCancel} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => ("plan" in result ? onSave(result.plan) : setShowErrors(true))}
            className="min-h-11 text-sm font-semibold"
            style={{ color: ACCENT }}
          >
            Save plan
          </button>
        </div>
        {onDelete &&
          (confirmDelete ? (
            <div className="flex min-h-11 items-center justify-between px-3.5 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>Delete this plan? Your logged sets stay.</span>
              <span className="flex gap-4">
                <button type="button" onClick={() => setConfirmDelete(false)} style={{ color: "var(--text-secondary)" }}>
                  Keep
                </button>
                <button type="button" onClick={onDelete} className="font-semibold" style={{ color: "var(--status-critical)" }}>
                  Delete
                </button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
              Delete plan
            </button>
          ))}
      </div>
    </div>
  );
}

/** Settings → Workout plans: weekly templates the Log page's Plan tab
 * follows. See src/lib/workoutPlans.ts for how targets are worked out. */
export function WorkoutPlansCard({ isDemoData, searchQuery, workoutItems }: { isDemoData: boolean; searchQuery: string; workoutItems: RawItem[] }) {
  const { plans, loading, save, remove } = useWorkoutPlans();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realLogs, setRealLogs] = useState<RawWorkoutLog[]>([]);
  const demoLogs = useMemo(() => (isDemoData ? buildDemoDataset().workoutLogs : []), [isDemoData]);
  const logs = isDemoData ? demoLogs : realLogs;
  const today = useMemo(() => todayLocalISODate(), []);

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    getAllWorkoutLogs()
      .then((rows) => !cancelled && setRealLogs(rows))
      .catch((err) => console.error("getAllWorkoutLogs failed", err));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  if (isSearching && !"workout plans plan template weekly progression".includes(query) && !plans.some((p) => p.name.toLowerCase().includes(query))) return null;

  const activeCount = plans.filter((p) => p.isActive).length;

  async function handleSave(plan: WorkoutPlan) {
    setEditing(null);
    setActionError(null);
    await save(plan).catch((err: Error) => setActionError(err.message));
  }

  async function handleDelete(id: string) {
    setEditing(null);
    setActionError(null);
    await remove(id).catch((err: Error) => setActionError(err.message));
  }

  return (
    <CollapsibleManageCard title="Workout plans" subtitle={loading ? undefined : activeCount ? `${activeCount} active` : "none"} forceOpen={isSearching} bare>
      {editing ? (
        <PlanEditor
          key={editing.id}
          initial={editing}
          items={workoutItems}
          logs={logs}
          today={today}
          onCancel={() => setEditing(null)}
          onSave={(plan) => void handleSave(plan)}
          onDelete={editing.isNew ? undefined : () => void handleDelete(editing.id)}
        />
      ) : loading ? (
        <p className="px-4 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <>
          <div className={GROUP_CLS} style={GROUP_STYLE}>
            {plans.map((plan) => (
              <button key={plan.id} type="button" onClick={() => setEditing(draftFromPlan(plan))} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
                <span className="flex-1 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                  {plan.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                  {planSubtitle(plan, today)}
                  <ChevronIcon dir="right" size={14} />
                </span>
              </button>
            ))}
            <button type="button" onClick={() => setEditing(newDraft(today))} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: ACCENT }}>
              New plan
            </button>
          </div>
          {actionError && (
            <p className="px-4 text-sm" style={{ color: "var(--status-warning)" }}>
              {actionError}
            </p>
          )}
          <GroupNote>
            A weekly template: which lifts on which days, each as +kg or % of that week&rsquo;s base. The base goes up by the weekly gain each week, and stays put for a lift if you
            missed or fell short on it. Follow it from Log → Workout → Plan.
          </GroupNote>
        </>
      )}
    </CollapsibleManageCard>
  );
}
