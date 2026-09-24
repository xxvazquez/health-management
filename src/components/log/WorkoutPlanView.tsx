"use client";

import { useMemo, useState } from "react";
import { InfoButton } from "@/components/ui/InfoButton";
import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import type { RawItem, RawWorkoutLog } from "@/lib/types";
import {
  WEEKDAY_SHORT,
  addDays,
  describeSession,
  mondayOf,
  nextPlannedDate,
  planCoversDate,
  planWeekIndex,
  plannedSetsForWeek,
  type LoggedValues,
  type PlannedSet,
  type WorkoutPlan,
} from "@/lib/workoutPlans";
import { ExerciseRow } from "./WorkoutTab";

function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Builds the plan engine's log lookup from the local workout log —
 * `workout_logs` are keyed by exercise name in app code, plans by
 * `workout_items` id, so resolve through the item registry. */
export function useLoggedValues(logs: RawWorkoutLog[], itemsById: Map<string, RawItem>): LoggedValues {
  return useMemo(() => {
    const byKey = new Map<string, number[]>();
    for (const log of logs) {
      const key = `${log.exercise}|${log.date}`;
      const list = byKey.get(key);
      if (list) list.push(log.weightKg);
      else byKey.set(key, [log.weightKg]);
    }
    return (itemId, date) => {
      const item = itemsById.get(itemId);
      return item ? (byKey.get(`${item.rawName}|${date}`) ?? []) : [];
    };
  }, [logs, itemsById]);
}

function StatusLine({ set }: { set: PlannedSet }) {
  const status =
    set.status === "done"
      ? { text: "✓ Done", color: "var(--status-good)" }
      : set.status === "short"
        ? { text: `Short: ${set.loggedKg} kg`, color: "var(--status-warning)" }
        : set.status === "missed"
          ? { text: "Missed", color: "var(--status-warning)" }
          : null;
  return (
    <p className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
      <span className="whitespace-nowrap">Target {set.targetKg} kg</span>
      {" · "}
      <span className="whitespace-nowrap">{describeSession(set.session)}</span>
      {status && (
        <>
          {" · "}
          <span className="font-medium whitespace-nowrap" style={{ color: status.color }}>
            {status.text}
          </span>
        </>
      )}
    </p>
  );
}

/** Mon–Sun at a glance for one plan, laid out like the iOS Calendar week
 * row: weekday letter over the date, the selected day in a filled circle,
 * today in the accent. A training day's dot fills in as its sets get done
 * and turns amber when one was missed or short. Tap a day to open it. */
function WeekStrip({
  sets,
  monday,
  date,
  today,
  accent,
  onNavigateToDate,
}: {
  sets: PlannedSet[];
  monday: string;
  date: string;
  today: string;
  accent: string;
  onNavigateToDate: (date: string) => void;
}) {
  return (
    <div className="grid grid-cols-7">
      {WEEKDAY_SHORT.map((label, i) => {
        const day = addDays(monday, i);
        const daySets = sets.filter((s) => s.date === day);
        const done = daySets.filter((s) => s.status === "done").length;
        const bad = daySets.some((s) => s.status === "missed" || s.status === "short");
        const selected = day === date;
        const dot =
          daySets.length === 0
            ? null
            : done === daySets.length
              ? { background: accent, border: accent }
              : bad
                ? { background: "var(--status-warning)", border: "var(--status-warning)" }
                : { background: "transparent", border: accent };
        const isToday = day === today;
        return (
          <button
            key={day}
            type="button"
            onClick={() => onNavigateToDate(day)}
            aria-pressed={selected}
            aria-label={`${label} ${Number(day.slice(8))}${daySets.length ? `, ${done} of ${daySets.length} done` : ", rest day"}`}
            className="flex flex-col items-center gap-1 py-1"
          >
            <span className="text-xs" style={{ color: "var(--text-muted)" }} aria-hidden>
              {label[0]}
            </span>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums"
              style={
                selected
                  ? { background: accent, color: "var(--on-accent)", fontWeight: 600 }
                  : { color: isToday ? accent : "var(--text-primary)", fontWeight: isToday ? 600 : 400 }
              }
              aria-hidden
            >
              {Number(day.slice(8))}
            </span>
            <span className="h-1.5 w-1.5 rounded-full border" style={dot ? { background: dot.background, borderColor: dot.border } : { borderColor: "transparent" }} />
          </button>
        );
      })}
    </div>
  );
}

/** Log → Workout → Plan: the selected day's planned sets from every active
 * plan, each prefilled with its target. Logging writes an ordinary workout
 * log, and a log at or above the target is what marks the set done. */
export function WorkoutPlanView({
  plans,
  itemsById,
  allLogs,
  entries,
  date,
  today,
  isDemoData,
  accent,
  onLog,
  onNavigateToDate,
}: {
  plans: WorkoutPlan[];
  itemsById: Map<string, RawItem>;
  allLogs: RawWorkoutLog[];
  /** The selected day's logs, for each row's "Logged today" line. */
  entries: RawWorkoutLog[];
  date: string;
  today: string;
  isDemoData: boolean;
  accent: string;
  onLog: (exercise: string, value: number) => Promise<void>;
  onNavigateToDate: (date: string) => void;
}) {
  const logged = useLoggedValues(allLogs, itemsById);
  const monday = mondayOf(date);
  const active = plans.filter((p) => p.isActive);
  const running = active.filter((p) => planCoversDate(p, date));
  const upcoming = active.filter((p) => p.startDate > date);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {running.length === 0 && (
        <div className="rounded-xl border px-3.5 py-3 text-sm" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}>
          {active.length === 0 ? "No active plans yet. Create a weekly plan in Settings → Workout plans." : "No plan runs on this day."}
          {upcoming.map((p) => (
            <p key={p.id} className="mt-1">
              {p.name} starts {shortDate(p.startDate)}.
            </p>
          ))}
        </div>
      )}

      {running.map((plan) => {
        const weekSets = plannedSetsForWeek(plan, monday, today, logged);
        const daySets = weekSets.filter((s) => s.date === date && itemsById.has(s.itemId));
        const week = planWeekIndex(plan, date) + 1;
        const next = daySets.length === 0 ? nextPlannedDate(plan, date) : null;
        const weekDone = weekSets.filter((s) => s.status === "done").length;
        return (
          <div key={plan.id} className="flex flex-col gap-2">
            <div className="flex min-h-9 items-center justify-between gap-3 px-3.5">
              <span className="flex min-w-0 items-center gap-1">
                <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  {plan.name} · Week {week}
                  {plan.weeks !== null && ` of ${plan.weeks}`}
                </p>
                <InfoButton open={infoOpen} onToggle={() => setInfoOpen((o) => !o)} size={12} />
              </span>
              <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {weekDone}/{weekSets.length} this week
              </p>
            </div>
            {infoOpen && (
              <p className="px-3.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                A set counts as done once you log that exercise on its day at or above the target, from here or from the normal Log tab. Logging less marks it short. Dots: filled means done, amber means missed or short, an outline means still to do.
              </p>
            )}
            <WeekStrip sets={weekSets} monday={monday} date={date} today={today} accent={accent} onNavigateToDate={onNavigateToDate} />
            <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
              {daySets.length === 0 ? (
                next ? (
                  <button type="button" onClick={() => onNavigateToDate(next)} className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm" style={{ color: "var(--text-secondary)" }}>
                    Rest day. Next: {shortDate(next)}
                    <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
                      <ChevronIcon dir="right" size={14} />
                    </span>
                  </button>
                ) : (
                  <p className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Rest day.
                  </p>
                )
              ) : (
                daySets.map((set, i) => {
                  const item = itemsById.get(set.itemId)!;
                  return (
                    <ExerciseRow
                      // Keyed on the target so the prefilled value follows it
                      // when the plan (or a finished week) changes it.
                      key={`${set.itemId}:${i}:${set.targetKg}`}
                      item={item}
                      lastValue={set.targetKg}
                      todaysSets={entries.filter((e) => e.exercise === item.rawName).map((e) => e.weightKg)}
                      isDemoData={isDemoData}
                      accent={accent}
                      detail={<StatusLine set={set} />}
                      onLog={(value) => onLog(item.rawName, value)}
                    />
                  );
                })
              )}
            </div>
          </div>
        );
      })}

      <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <Link href="/manage/" className="flex min-h-11 items-center gap-2 px-3.5 text-sm" style={{ color: "var(--text-primary)" }}>
          Manage plans in Settings
          <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
            <ChevronIcon dir="right" size={14} />
          </span>
        </Link>
      </div>
    </div>
  );
}
