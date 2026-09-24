/**
 * Weekly workout plans — a one-week template (which lifts on which
 * weekdays, each as "+N kg" or "N %" of the lift's weekly base) that
 * repeats, with each lift's base rising by its own `weeklyGainKg` each
 * week. Supabase's
 * `workout_plans` table; see `src/lib/supabase/workoutPlans.ts`.
 *
 * Nothing per-week is stored: every target is derived here from the plan
 * and the workout log, the same way cycle predictions are derived from
 * period days. A planned set counts as done when that exercise has a log
 * on that date at or above the target — plan sets are logged as ordinary
 * `workout_logs` rows, so charts and exports need no special case.
 */

export type PlanAdjustMode = "kg" | "percent";

/** One exercise in a plan (a `workout_items` id), its week-1 base and how
 * much that base goes up each week. */
export interface WorkoutPlanLift {
  itemId: string;
  baseKg: number;
  weeklyGainKg: number;
}

/** One lift on one weekday. `weekday` is ISO: 1 = Monday … 7 = Sunday.
 * `mode: "kg"` adds `amount` to the week's base (negative for a lighter
 * day); `mode: "percent"` takes `amount` % of it. */
export interface WorkoutPlanSession {
  weekday: number;
  itemId: string;
  mode: PlanAdjustMode;
  amount: number;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  /** YYYY-MM-DD, always a Monday — week 1 starts here. */
  startDate: string;
  /** Plan length in weeks; null keeps it running until paused or deleted. */
  weeks: number | null;
  /** A week with a missed or short set keeps that lift's base instead of
   * adding its `weeklyGainKg`. */
  holdOnMiss: boolean;
  isActive: boolean;
  lifts: WorkoutPlanLift[];
  sessions: WorkoutPlanSession[];
  /** YYYY-MM-DD the plan was created — sets before it never count as
   * missed (a plan started mid-week shouldn't hold on day one). */
  createdDate: string;
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

// ---- Date helpers (UTC arithmetic on YYYY-MM-DD, so DST never shifts a day)

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * 86_400_000);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const day = new Date(toUtc(iso)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso));
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** 0-based plan week `date` falls in; negative before the plan starts. */
export function planWeekIndex(plan: WorkoutPlan, date: string): number {
  return Math.floor(daysBetween(plan.startDate, date) / 7);
}

/** Whether `date` is inside the plan's run (ignores `isActive`). */
export function planCoversDate(plan: WorkoutPlan, date: string): boolean {
  const week = planWeekIndex(plan, date);
  return week >= 0 && (plan.weeks === null || week < plan.weeks);
}

// ---- Targets

/** Targets land on the Log stepper's 0.25 kg step, so every one can be
 * tapped in exactly. */
const TARGET_STEP_KG = 0.25;

export function sessionTargetKg(baseKg: number, session: Pick<WorkoutPlanSession, "mode" | "amount">): number {
  const raw = session.mode === "percent" ? (baseKg * session.amount) / 100 : baseKg + session.amount;
  return Math.max(0, Math.round(raw / TARGET_STEP_KG) * TARGET_STEP_KG);
}

/** How a planned set stands against the log. */
export type PlannedSetStatus = "done" | "short" | "missed" | "today" | "upcoming" | "skipped";

export interface PlannedSet {
  planId: string;
  date: string;
  weekday: number;
  itemId: string;
  session: WorkoutPlanSession;
  /** 0-based plan week. */
  week: number;
  baseKg: number;
  targetKg: number;
  /** Heaviest value logged for this exercise on this date, if any. */
  loggedKg: number | null;
  status: PlannedSetStatus;
}

/** Every value logged for an exercise (by `workout_items` id) on a date. */
export type LoggedValues = (itemId: string, date: string) => number[];

const EPSILON = 0.001;

function statusFor(plan: WorkoutPlan, date: string, today: string, targetKg: number, logged: number[]): { status: PlannedSetStatus; loggedKg: number | null } {
  const loggedKg = logged.length > 0 ? Math.max(...logged) : null;
  if (loggedKg !== null && loggedKg + EPSILON >= targetKg) return { status: "done", loggedKg };
  if (loggedKg !== null) return { status: "short", loggedKg };
  if (date < plan.createdDate) return { status: "skipped", loggedKg };
  if (date < today) return { status: "missed", loggedKg };
  if (date === today) return { status: "today", loggedKg };
  return { status: "upcoming", loggedKg };
}

/**
 * Each lift's base for weeks 0…`throughWeek`. Week 0 is the lift's
 * `baseKg`; each later week adds the lift's `weeklyGainKg` — unless `holdOnMiss` is on
 * and the previous week is already over with a set of that lift missed or
 * short, in which case the base stays. Weeks not yet finished are
 * projected as if every set gets done.
 */
export function liftBasesByWeek(plan: WorkoutPlan, throughWeek: number, today: string, logged: LoggedValues): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const lift of plan.lifts) {
    const bases = [lift.baseKg];
    const liftSessions = plan.sessions.filter((s) => s.itemId === lift.itemId);
    for (let week = 1; week <= throughWeek; week++) {
      const prevBase = bases[week - 1];
      const prevWeekStart = addDays(plan.startDate, (week - 1) * 7);
      const prevWeekOver = addDays(prevWeekStart, 6) < today;
      let hold = false;
      if (plan.holdOnMiss && prevWeekOver) {
        hold = liftSessions.some((s) => {
          const date = addDays(prevWeekStart, s.weekday - 1);
          const target = sessionTargetKg(prevBase, s);
          const { status } = statusFor(plan, date, today, target, logged(lift.itemId, date));
          return status === "missed" || status === "short";
        });
      }
      bases.push(hold ? prevBase : Math.round((prevBase + lift.weeklyGainKg) * 100) / 100);
    }
    result.set(lift.itemId, bases);
  }
  return result;
}

/** A plan's sets for the week starting at `monday`, in weekday order.
 * Empty when that week is outside the plan's run. */
export function plannedSetsForWeek(plan: WorkoutPlan, monday: string, today: string, logged: LoggedValues): PlannedSet[] {
  const week = planWeekIndex(plan, monday);
  if (!planCoversDate(plan, monday)) return [];
  const bases = liftBasesByWeek(plan, week, today, logged);
  const sets: PlannedSet[] = [];
  const sessions = [...plan.sessions].sort((a, b) => a.weekday - b.weekday);
  for (const session of sessions) {
    const liftBases = bases.get(session.itemId);
    if (!liftBases) continue;
    const baseKg = liftBases[week];
    const date = addDays(monday, session.weekday - 1);
    const targetKg = sessionTargetKg(baseKg, session);
    sets.push({ planId: plan.id, date, weekday: session.weekday, itemId: session.itemId, session, week, baseKg, targetKg, ...statusFor(plan, date, today, targetKg, logged(session.itemId, date)) });
  }
  return sets;
}

export function plannedSetsOn(plan: WorkoutPlan, date: string, today: string, logged: LoggedValues): PlannedSet[] {
  return plannedSetsForWeek(plan, mondayOf(date), today, logged).filter((s) => s.date === date);
}

/** The first date after `date` (within 8 weeks) the plan has any set on. */
export function nextPlannedDate(plan: WorkoutPlan, date: string): string | null {
  const weekdays = new Set(plan.sessions.map((s) => s.weekday));
  if (weekdays.size === 0) return null;
  for (let i = 1; i <= 56; i++) {
    const d = addDays(date, i);
    if (planCoversDate(plan, d) && weekdays.has(isoWeekday(d))) return d;
  }
  return null;
}

/** "This week's weight" suggestion for a lift's base: the heaviest value
 * logged in the 7 days up to `today`, else the most recent one ever. */
export function suggestBaseKg(logs: { date: string; value: number }[], today: string): number | null {
  const weekAgo = addDays(today, -6);
  const recent = logs.filter((l) => l.date >= weekAgo && l.date <= today).map((l) => l.value);
  if (recent.length > 0) return Math.max(...recent);
  const latest = [...logs].filter((l) => l.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? latest.value : null;
}

export function describeSession(session: Pick<WorkoutPlanSession, "mode" | "amount">): string {
  if (session.mode === "percent") return `${session.amount}%`;
  if (session.amount === 0) return "base";
  return `${session.amount > 0 ? "+" : "−"}${Math.abs(session.amount)} kg`;
}
