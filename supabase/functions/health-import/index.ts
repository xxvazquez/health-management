// Takes a day's numbers from an iOS Shortcut reading Apple Health and saves
// them in Lauva: walking minutes and steps as that day's Walking / Steps
// entries in Log → Workout, the latest weight and blood pressure as that
// day's readings in Health → Vitals. Every field is optional; the shortcut
// sends whichever it reads. The shortcut has no Supabase session, so it
// authenticates with a per-user token (health_import_tokens) in the query
// string or body; the Authorization header carries the anon key to pass the
// platform's JWT gate.
//
// A backfill sends `days`, a list of objects with the same fields (each with
// its own `date`, no date twice), and every day is saved the same way in one
// request.
//
// One entry per day and kind: the row id is derived from (user, kind, date),
// so running the shortcut again the same day replaces the value instead of
// adding a second entry. Apple Health is that day's record: an entry typed
// in by hand for the same kind and day is removed so it isn't counted twice.
// A 0 removes the imported entry and leaves typed ones.
//
// Deployed by .github/workflows/deploy-functions.yml. SUPABASE_URL and the
// project's secret key are injected automatically; no other secrets.

import { createClient } from "npm:@supabase/supabase-js@2";
import { secretKey } from "../_shared/keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DEFAULT_EXERCISE = "Walking";
const STEPS_EXERCISE = "Steps";
const STEPS_UNIT = "steps";
const DEFAULT_TIMEZONE = "Europe/Warsaw";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, secretKey()!);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SEVERAL_VALUES = "got several values: send one day per request, or a days list with a date on each";

/** The number in whatever Shortcuts sends ("34", "72,5 kg", 34), or null
 * when the field is missing or empty (no Apple Health sample that day). A
 * list of samples is refused rather than read as its first value. */
function parseNumber(raw: unknown, name: string): number | null {
  if (Array.isArray(raw)) {
    if (raw.length > 1) throw new HttpError(400, `${name} ${SEVERAL_VALUES}`);
    return parseNumber(raw[0], name);
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.replace(",", ".").match(/-?\d+(\.\d+)?/g);
  if (m && m.length > 1) throw new HttpError(400, `${name} ${SEVERAL_VALUES}`);
  return m ? Number(m[0]) : null;
}

/** A step count, allowing thousands separators ("8,432", "8 432"). */
function parseCount(raw: unknown, name: string): number | null {
  if (typeof raw !== "string") return parseNumber(raw, name);
  const compact = raw.trim().replace(/[ \u00a0\u202f]/g, "");
  if (/^\d{1,3}([,.]\d{3})+$/.test(compact)) return Number(compact.replace(/[,.]/g, ""));
  return parseNumber(compact, name);
}

/** "2026-10-02", or today in `timeZone` when the shortcut sends none. */
function parseDate(raw: unknown, timeZone: string): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
  }
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** The UTC instant of `hour`:00 on `date` in `timeZone`. */
function zonedTime(date: string, hour: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const offsetAt = (t: number) => {
    try {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
          .formatToParts(new Date(t))
          .map((p) => [p.type, p.value]),
      );
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - t;
    } catch {
      return 0;
    }
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A stable UUID (version-5 layout) from a name, so the same day always maps to the same row. */
async function stableId(name: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(name))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function check(error: { message: string } | null, what: string) {
  if (error) {
    console.error(`health-import: ${what} failed`, error.message);
    throw new HttpError(500, "Server error");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await handle(req);
  } catch (err) {
    console.error("health-import: unhandled", err);
    return json({ error: "Server error" }, 500);
  }
});

interface Workout {
  id: string;
  category_id: string;
  is_archived: boolean;
}

async function findExercise(ownerId: string, name: string): Promise<Workout | null> {
  const { data, error } = await admin
    .from("workout_items")
    .select("id, category_id, is_archived")
    .eq("user_id", ownerId)
    .eq("name_key", name.toLowerCase())
    .maybeSingle();
  check(error, "exercise lookup");
  return data as Workout | null;
}

/** The Steps exercise, created beside Walking (or in the first workout
 * category) the first time steps arrive. */
async function stepsExercise(ownerId: string, date: string): Promise<string> {
  const existing = await findExercise(ownerId, STEPS_EXERCISE);
  if (existing?.is_archived) throw new HttpError(404, `"${STEPS_EXERCISE}" is archived in Settings → Workout`);
  if (existing) return existing.id;

  let categoryId = (await findExercise(ownerId, DEFAULT_EXERCISE))?.category_id ?? null;
  if (!categoryId) {
    const { data, error } = await admin
      .from("categories")
      .select("id")
      .eq("user_id", ownerId)
      .eq("item_type", "workout")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name_key")
      .limit(1)
      .maybeSingle();
    check(error, "category lookup");
    categoryId = (data?.id as string | undefined) ?? null;
  }
  if (!categoryId) throw new HttpError(404, "Add a Workout category in Settings first");

  const { data, error } = await admin
    .from("workout_items")
    .insert({ user_id: ownerId, name: STEPS_EXERCISE, item_type: "workout", category_id: categoryId, unit: STEPS_UNIT, created_date: date })
    .select("id")
    .single();
  check(error, "creating Steps");
  return data!.id as string;
}

/** That day's single imported entry for an exercise; typed ones that day are removed. */
async function saveWorkoutDay(ownerId: string, itemId: string, date: string, value: number) {
  const id = await stableId(`apple-health:${ownerId}:${itemId}:${date}`);
  if (value === 0) {
    const { error } = await admin.from("workout_logs").delete().eq("user_id", ownerId).eq("id", id);
    check(error, "workout delete");
    return;
  }
  const { error } = await admin
    .from("workout_logs")
    .upsert({ id, user_id: ownerId, item_id: itemId, date, weight_kg: value, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
  check(error, "workout upsert");
  const { error: dupErr } = await admin.from("workout_logs").delete().eq("user_id", ownerId).eq("item_id", itemId).eq("date", date).neq("id", id);
  if (dupErr) console.error("health-import: removing typed workout entries failed", dupErr.message);
}

/** That day's single imported weight or blood-pressure reading, timed at
 * midday; readings typed for the same day are removed. */
async function saveVitalDay(
  ownerId: string,
  table: "weight_logs" | "blood_pressure",
  kind: "weight" | "bp",
  date: string,
  timeZone: string,
  values: Record<string, number> | null,
) {
  const id = await stableId(`apple-health:${ownerId}:${kind}:${date}`);
  if (!values) {
    const { error } = await admin.from(table).delete().eq("user_id", ownerId).eq("id", id);
    check(error, `${kind} delete`);
    return;
  }
  const { error } = await admin
    .from(table)
    .upsert({ id, user_id: ownerId, measured_at: zonedTime(date, 12, timeZone).toISOString(), ...values, updated_at: new Date().toISOString() }, { onConflict: "id" });
  check(error, `${kind} upsert`);
  const { error: dupErr } = await admin
    .from(table)
    .delete()
    .eq("user_id", ownerId)
    .gte("measured_at", zonedTime(date, 0, timeZone).toISOString())
    .lt("measured_at", zonedTime(nextDay(date), 0, timeZone).toISOString())
    .neq("id", id);
  if (dupErr) console.error(`health-import: removing typed ${kind} readings failed`, dupErr.message);
}

function inRange(v: number | null, min: number, max: number, message: string) {
  if (v !== null && v !== 0 && (v < min || v > max)) throw new HttpError(400, message);
  if (v !== null && v < 0) throw new HttpError(400, message);
}

async function handle(req: Request): Promise<Response> {
  try {
    return await importDay(req);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    throw err;
  }
}

interface Day {
  date: string;
  minutes: number | null;
  steps: number | null;
  weight: number | null;
  systolic: number | null;
  diastolic: number | null;
}

const MAX_DAYS = 400;

function lowerKeys(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
}

function parseDay(field: (name: string) => unknown, timeZone: string, needDate: boolean): Day {
  const minutes = parseNumber(field("minutes"), "minutes");
  const steps = parseCount(field("steps"), "steps");
  const weight = parseNumber(field("weight"), "weight");
  const systolic = parseNumber(field("systolic"), "systolic");
  const diastolic = parseNumber(field("diastolic"), "diastolic");
  if ([minutes, steps, weight, systolic, diastolic].every((v) => v === null)) {
    throw new HttpError(400, "Send at least one of minutes, steps, weight, systolic + diastolic");
  }
  inRange(minutes, 0, 24 * 60, "minutes must be a number from 0 to 1440");
  inRange(steps, 0, 200_000, "steps must be a number from 0 to 200000");
  inRange(weight, 10, 500, "weight must be in kg, from 10 to 500");
  inRange(systolic, 40, 300, "systolic must be from 40 to 300");
  inRange(diastolic, 20, 200, "diastolic must be from 20 to 200");
  if ((systolic === null) !== (diastolic === null)) throw new HttpError(400, "Send systolic and diastolic together");
  const bpZero = systolic === 0 && diastolic === 0;
  if (systolic !== null && diastolic !== null && !bpZero && systolic <= diastolic) {
    throw new HttpError(400, "systolic must be higher than diastolic");
  }

  const rawDate = field("date");
  if (needDate && (typeof rawDate !== "string" || !rawDate.trim())) throw new HttpError(400, "every day in days needs a date");
  const date = parseDate(rawDate, timeZone);
  if (!date) throw new HttpError(400, "date must look like 2026-10-02");
  return { date, minutes, steps, weight, systolic, diastolic };
}

async function saveDay(ownerId: string, day: Day, timeZone: string, walkingId: string | null, stepsId: string | null) {
  const { date, minutes, steps, weight, systolic, diastolic } = day;
  if (minutes !== null && walkingId) await saveWorkoutDay(ownerId, walkingId, date, Math.round(minutes));
  if (steps !== null && stepsId) await saveWorkoutDay(ownerId, stepsId, date, Math.round(steps));
  if (weight !== null) {
    const kg = Math.round(weight * 10) / 10;
    await saveVitalDay(ownerId, "weight_logs", "weight", date, timeZone, kg === 0 ? null : { kg });
  }
  if (systolic !== null && diastolic !== null) {
    const bpZero = systolic === 0 && diastolic === 0;
    const bp = { systolic: Math.round(systolic), diastolic: Math.round(diastolic) };
    await saveVitalDay(ownerId, "blood_pressure", "bp", date, timeZone, bpZero ? null : bp);
  }
}

async function importDay(req: Request): Promise<Response> {
  const query = new URL(req.url).searchParams;
  let body: Record<string, unknown> = {};
  try {
    // Shortcuts capitalises the first letter of a JSON field name.
    body = lowerKeys(JSON.parse(await req.text())) ?? {};
  } catch {
    body = {};
  }
  const field = (name: string) => query.get(name) ?? body[name];

  const token = String(field("token") ?? "").trim();
  if (!token) return json({ error: "token is required" }, 400);
  const timeZone = String(field("timezone") ?? DEFAULT_TIMEZONE);

  const bulk = Array.isArray(body.days);
  let days: Day[];
  if (bulk) {
    const list = body.days as unknown[];
    if (list.length === 0) return json({ error: "days is empty" }, 400);
    if (list.length > MAX_DAYS) return json({ error: `Send up to ${MAX_DAYS} days per request` }, 400);
    const byDate = new Map<string, Day>();
    list.forEach((raw, i) => {
      const entry = lowerKeys(raw);
      if (!entry) throw new HttpError(400, `days[${i}] must be an object`);
      try {
        const day = parseDay((name) => entry[name], timeZone, true);
        if (byDate.has(day.date)) throw new HttpError(400, `${day.date} appears more than once; check each day has its own date`);
        byDate.set(day.date, day);
      } catch (err) {
        if (err instanceof HttpError) throw new HttpError(400, `days[${i}]: ${err.message}`);
        throw err;
      }
    });
    days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  } else {
    days = [parseDay(field, timeZone, false)];
  }

  const { data: tok, error: tokErr } = await admin.from("health_import_tokens").select("owner_id").eq("token", token).maybeSingle();
  check(tokErr, "token lookup");
  if (!tok) return json({ error: "Unknown token" }, 401);
  const ownerId = tok.owner_id as string;

  let walkingId: string | null = null;
  if (days.some((d) => d.minutes !== null)) {
    const exercise = String(field("exercise") ?? DEFAULT_EXERCISE).trim() || DEFAULT_EXERCISE;
    const item = await findExercise(ownerId, exercise);
    if (!item || item.is_archived) throw new HttpError(404, `No active exercise called "${exercise}" in Settings → Workout`);
    walkingId = item.id;
  }
  const stepsId = days.some((d) => d.steps !== null) ? await stepsExercise(ownerId, days[0].date) : null;

  // A few days at a time keeps a year's backfill well inside the function's time limit.
  for (let i = 0; i < days.length; i += 10) {
    await Promise.all(days.slice(i, i + 10).map((d) => saveDay(ownerId, d, timeZone, walkingId, stepsId)));
  }

  await admin.from("health_import_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token);
  if (bulk) return json({ ok: true, days: days.length, from: days[0].date, to: days[days.length - 1].date });

  const [{ date, minutes, steps, weight, systolic, diastolic }] = days;
  const saved: Record<string, number> = {};
  if (minutes !== null) saved.minutes = Math.round(minutes);
  if (steps !== null) saved.steps = Math.round(steps);
  if (weight !== null) saved.weight = Math.round(weight * 10) / 10;
  if (systolic !== null && diastolic !== null) Object.assign(saved, { systolic: Math.round(systolic), diastolic: Math.round(diastolic) });
  return json({ ok: true, date, ...saved });
}
