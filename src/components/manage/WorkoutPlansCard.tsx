"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import { FormGroup } from "@/components/ui/FormGroup";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { KgWheels, NumberWheel, numberRange } from "@/components/ui/NumberWheels";
import { Sheet } from "@/components/ui/Sheet";
import { DatePicker } from "@/components/ui/DatePicker";
import { SwitchRow } from "@/components/ui/Switch";
import { ROW_INLINE_CLS, ROW_STYLE } from "@/components/ui/formField";
import { useLoggedValues } from "@/components/log/WorkoutPlanView";
import { CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, GroupNote, OpenInLogRow } from "@/components/manage/ManageSection";
import { getAllWorkoutLogs } from "@/lib/db/indexedDb";
import { buildDemoDataset } from "@/lib/demoData";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { useWorkoutPlans } from "@/lib/useWorkoutPlans";
import type { RawItem, RawWorkoutLog } from "@/lib/types";
import {
  WEEKDAY_SHORT,
  addDays,
  describeSession,
  mondayOf,
  planCoversDate,
  planWeekIndex,
  plannedSetsForWeek,
  sessionTargetKg,
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
  amount: number;
}

/** The editor's working copy. `weeks: 0` means ongoing. */
interface Draft {
  id: string;
  isNew: boolean;
  name: string;
  startDate: string;
  weeks: number;
  hold: boolean;
  active: boolean;
  lifts: { itemId: string; base: number; gain: number }[];
  sessions: DraftSession[];
  createdDate: string;
}

function signedKg(value: number): string {
  if (value === 0) return "0 kg";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)} kg`;
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
    weeks: plan.weeks ?? 0,
    hold: plan.holdOnMiss,
    active: plan.isActive,
    lifts: plan.lifts.map((l) => ({ itemId: l.itemId, base: l.baseKg, gain: l.weeklyGainKg })),
    sessions: plan.sessions.map((s, i) => ({ key: `s${i}`, weekday: s.weekday, itemId: s.itemId, mode: s.mode, amount: s.amount })),
    createdDate: plan.createdDate,
  };
}

function newDraft(today: string): Draft {
  return {
    id: crypto.randomUUID(),
    isNew: true,
    name: "",
    startDate: addDays(mondayOf(today), 7),
    weeks: 0,
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
  const lifts = d.lifts.map((l) => ({ itemId: l.itemId, baseKg: l.base, weeklyGainKg: l.gain }));
  if (lifts.some((l) => !(l.baseKg > 0))) return { error: "Every lift needs this week's weight." };
  const sessions = d.sessions.filter((s) => d.lifts.some((l) => l.itemId === s.itemId)).map((s) => ({ weekday: s.weekday, itemId: s.itemId, mode: s.mode, amount: s.amount }));
  if (sessions.length === 0) return { error: "Put at least one lift on a day." };
  return {
    plan: {
      id: d.id,
      name: d.name.trim(),
      startDate: d.startDate,
      weeks: d.weeks > 0 ? d.weeks : null,
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

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

function LiftSheet({
  name,
  base,
  gain,
  onChange,
  onRemove,
  onClose,
}: {
  name: string;
  base: number;
  gain: number;
  onChange: (patch: { base?: number; gain?: number }) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<"base" | "gain" | null>(null);
  const titleId = useId();
  const toggle = (row: "base" | "gain") => setOpen((o) => (o === row ? null : row));
  return (
    <Sheet title={name} titleId={titleId} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <FormGroup footer="The starting weight is week 1's base. The weekly amount is added to it once a week.">
          <ValueRow label="Starting weight" value={`${base} kg`} open={open === "base"} onToggle={() => toggle("base")}>
            <KgWheels value={base} onChange={(v) => onChange({ base: v })} label="Starting weight" />
          </ValueRow>
          <ValueRow label="Added each week" value={`+${gain} kg`} open={open === "gain"} onToggle={() => toggle("gain")}>
            <NumberWheel values={GAIN_VALUES} value={gain} onChange={(v) => onChange({ gain: v })} format={(v) => `+${v} kg`} label="Added each week" />
          </ValueRow>
        </FormGroup>
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button type="button" onClick={onRemove} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
            Remove from plan
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function DaySheet({
  weekday,
  sessions,
  lifts,
  nameOf,
  onAdd,
  onPatch,
  onRemove,
  onClose,
}: {
  weekday: number;
  sessions: DraftSession[];
  lifts: Draft["lifts"];
  nameOf: (id: string) => string;
  onAdd: () => void;
  onPatch: (key: string, patch: Partial<DraftSession>) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const titleId = useId();
  return (
    <Sheet title={WEEKDAY_LONG[weekday - 1]} titleId={titleId} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {sessions.length === 0 && (
          <p className="px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Rest day. Add an exercise to train on {WEEKDAY_LONG[weekday - 1]}s.
          </p>
        )}
        {sessions.map((s) => {
          const base = lifts.find((l) => l.itemId === s.itemId)?.base ?? 0;
          const isPercent = s.mode === "percent";
          return (
            <FormGroup key={s.key} footer={`Week 1 target: ${sessionTargetKg(base, s)} kg (base ${base} kg).`}>
              <Field label="Exercise" inline>
                <select value={s.itemId} onChange={(e) => onPatch(s.key, { itemId: e.target.value })} className={ROW_INLINE_CLS} style={ROW_STYLE}>
                  {lifts.map((l) => (
                    <option key={l.itemId} value={l.itemId}>
                      {nameOf(l.itemId)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Weight
                </span>
                <Segmented
                  value={s.mode}
                  onChange={(mode) => onPatch(s.key, { mode, amount: mode === "percent" ? 80 : 0 })}
                  options={[
                    ["kg", "Base + kg"],
                    ["percent", "% of base"],
                  ]}
                />
              </div>
              <ValueRow
                label={isPercent ? "Share of base" : "Added to base"}
                value={isPercent ? `${s.amount}%` : signedKg(s.amount)}
                open={open === s.key}
                onToggle={() => setOpen((o) => (o === s.key ? null : s.key))}
              >
                {isPercent ? (
                  <NumberWheel values={PERCENT_VALUES} value={s.amount} onChange={(amount) => onPatch(s.key, { amount })} format={(v) => `${v}%`} label="Share of base" />
                ) : (
                  <NumberWheel values={OFFSET_VALUES} value={s.amount} onChange={(amount) => onPatch(s.key, { amount })} format={signedKg} label="Added to base" />
                )}
              </ValueRow>
              <button type="button" onClick={() => onRemove(s.key)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
                Remove {nameOf(s.itemId)}
              </button>
            </FormGroup>
          );
        })}
        <div className={GROUP_CLS} style={GROUP_STYLE}>
          <button type="button" onClick={onAdd} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: ACCENT }}>
            Add exercise
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** An inset-group row showing a value on the right; tapping it opens a
 * picker wheel under the row, the way iOS Calendar's date rows expand. */
function ValueRow({ label, value, open, onToggle, children }: { label: string; value: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm">
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        <span className="tabular-nums" style={{ color: open ? ACCENT : "var(--text-secondary)" }}>
          {value}
        </span>
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

/** A tappable summary row that opens a sheet: title (and optional detail
 * line) on the left, a muted value and chevron on the right. */
function NavRow({ title, detail, value, onClick }: { title: string; detail?: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-3 px-3.5 py-1.5 text-left">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
        {detail && (
          <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
            {detail}
          </span>
        )}
      </span>
      {value && (
        <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {value}
        </span>
      )}
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        <ChevronIcon dir="right" size={14} />
      </span>
    </button>
  );
}

const LENGTH_VALUES = numberRange(0, 52, 1);
const GAIN_VALUES = numberRange(0, 10, 0.25);
const OFFSET_VALUES = numberRange(-20, 30, 0.25);
const PERCENT_VALUES = numberRange(30, 150, 5);

function weeksLabel(weeks: number): string {
  return weeks === 0 ? "Ongoing" : `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
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
  const [lengthOpen, setLengthOpen] = useState(false);
  const [liftSheet, setLiftSheet] = useState<string | null>(null);
  const [daySheet, setDaySheet] = useState<number | null>(null);
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
    update({ lifts: [...d.lifts, { itemId, base: suggestion ?? 20, gain: 2.5 }] });
  }

  function patchLift(itemId: string, patch: Partial<Draft["lifts"][number]>) {
    update({ lifts: d.lifts.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) });
  }

  function removeLift(itemId: string) {
    update({ lifts: d.lifts.filter((l) => l.itemId !== itemId), sessions: d.sessions.filter((s) => s.itemId !== itemId) });
  }

  function addSession(weekday: number) {
    const onDay = new Set(d.sessions.filter((s) => s.weekday === weekday).map((s) => s.itemId));
    const lift = d.lifts.find((l) => !onDay.has(l.itemId)) ?? d.lifts[0];
    if (!lift) return;
    update({ sessions: [...d.sessions, { key: crypto.randomUUID(), weekday, itemId: lift.itemId, mode: "kg", amount: 0 }] });
  }

  function patchSession(key: string, patch: Partial<DraftSession>) {
    update({ sessions: d.sessions.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  }

  const sheetLift = d.lifts.find((l) => l.itemId === liftSheet) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <FormGroup
        title="Plan"
        footer="Ongoing runs until you pause or delete it."
        info="Plan weeks run Monday to Sunday. With Hold weight on, missing a planned set or logging less than its target keeps that exercise at the same weight next week. Your other exercises still go up."
      >
        <Field label="Name" inline>
          <input value={d.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Squat 3x" maxLength={80} className={ROW_INLINE_CLS} style={ROW_STYLE} />
        </Field>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Starts week of
          </span>
          <DatePicker value={d.startDate} onChange={(v) => update({ startDate: mondayOf(v) })} title="Plan starts" ariaLabel="Plan starts week of" />
        </div>
        <ValueRow label="Length" value={weeksLabel(d.weeks)} open={lengthOpen} onToggle={() => setLengthOpen((o) => !o)}>
          <NumberWheel values={LENGTH_VALUES} value={d.weeks} onChange={(weeks) => update({ weeks })} format={weeksLabel} label="Plan length" />
        </ValueRow>
        <SwitchRow label="Hold weight after a missed week" on={d.hold} onChange={(hold) => update({ hold })} />
        {!d.isNew && <SwitchRow label="Active" on={d.active} onChange={(active) => update({ active })} />}
      </FormGroup>

      <FormGroup
        title="Exercises"
        footer="Tap an exercise to set its starting weight and how much it goes up each week."
        info="Each exercise has a base weight: the starting weight in week 1, then that plus the weekly amount every week after. Every day's target is worked out from this base. The starting weight is filled in from your heaviest set in the last 7 days."
      >
        {d.lifts.map((lift) => (
          <NavRow key={lift.itemId} title={nameOf(lift.itemId)} detail={`+${lift.gain} kg each week`} value={`${lift.base} kg`} onClick={() => setLiftSheet(lift.itemId)} />
        ))}
        {liftable.length > 0 ? (
          <label className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="text-sm" style={{ color: ACCENT }}>
              Add exercise
            </span>
            <select value="" onChange={(e) => e.target.value && addLift(e.target.value)} className={`${ROW_INLINE_CLS} flex-1`} style={ROW_STYLE}>
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
        <FormGroup
          title="Week"
          footer="Tap a day to choose what you lift and how heavy."
          info="A day's target is that week's base plus some kg (use a minus for a lighter day), or a % of the base, like 80% for an easy day. Targets are rounded to 0.25 kg so you can load them on the bar."
        >
          {WEEKDAY_LONG.map((label, i) => {
            const daySessions = d.sessions.filter((s) => s.weekday === i + 1);
            return (
              <NavRow
                key={label}
                title={label}
                detail={daySessions.length ? daySessions.map((s) => `${nameOf(s.itemId)} ${describeSession(s)}`).join(" · ") : undefined}
                value={daySessions.length ? undefined : "Rest"}
                onClick={() => setDaySheet(i + 1)}
              />
            );
          })}
        </FormGroup>
      )}

      {"plan" in result && (
        <FormGroup title="Preview" info="Upcoming weeks assume you hit every target. Once a week is over, it uses what you actually logged, so a held exercise shows up here.">
          <Preview plan={result.plan} today={today} logged={logged} nameOf={nameOf} />
        </FormGroup>
      )}

      {sheetLift && (
        <LiftSheet
          name={nameOf(sheetLift.itemId)}
          base={sheetLift.base}
          gain={sheetLift.gain}
          onChange={(patch) => patchLift(sheetLift.itemId, patch)}
          onRemove={() => {
            removeLift(sheetLift.itemId);
            setLiftSheet(null);
          }}
          onClose={() => setLiftSheet(null)}
        />
      )}

      {daySheet !== null && (
        <DaySheet
          weekday={daySheet}
          sessions={d.sessions.filter((s) => s.weekday === daySheet)}
          lifts={d.lifts}
          nameOf={nameOf}
          onAdd={() => addSession(daySheet)}
          onPatch={patchSession}
          onRemove={(key) => update({ sessions: d.sessions.filter((x) => x.key !== key) })}
          onClose={() => setDaySheet(null)}
        />
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
            A weekly template: which lifts on which days, each as +kg or % of that week&rsquo;s base. Each lift&rsquo;s base goes up by its own weekly gain, and stays put for a lift if you
            missed or fell short on it. Follow it from Log → Workout → Plan.
          </GroupNote>
          <OpenInLogRow tab="workout" label="Go to Workout in Log" />
        </>
      )}
    </CollapsibleManageCard>
  );
}
