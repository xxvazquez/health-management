import type { OutboxEntry } from "@/lib/db/indexedDb";

const TABLE_LABEL: Record<string, string> = {
  food_items: "Food item",
  supplement_items: "Supplement item",
  symptom_items: "Symptom item",
  habit_items: "Habit item",
  workout_items: "Workout item",
  food_logs: "Food log",
  supplement_logs: "Supplement log",
  symptom_logs: "Symptom log",
  habit_logs: "Habit log",
  food_diary: "Food note",
  supplement_diary: "Supplement note",
  symptom_diary: "Symptom note",
  habit_diary: "Habit note",
  workout_diary: "Workout note",
  categories: "Category",
  stool_logs: "Stool entry",
  workout_logs: "Workout entry",
  workout_plans: "Workout plan",
  period_logs: "Period entry",
  journal_entries: "Journal entry",
  personal_items: "Expiring item",
  blood_pressure: "Blood pressure reading",
  weight_logs: "Weight reading",
  weight_target: "Weight target",
  care_entry_files: "Linked Drive file",
};

export function friendlyTable(table: string): string {
  return TABLE_LABEL[table] ?? "Change";
}

export interface EntryDescription {
  /** What the change is about — the item, note text or entry. */
  title: string;
  /** What kind of change it is, e.g. "Food log" or "Deleted food log". */
  kind: string;
  /** Extra facts from the saved data: the day, meal, amount. */
  details: string[];
}

function text(value: unknown, max = 60): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/** Turns one queued change into something a person can recognise: which
 * item, what day, what kind of entry. `itemNames` maps item ids to names
 * (from the local cache) because a log only stores the item's id. */
export function describeOutboxEntry(entry: OutboxEntry, itemNames: Map<string, string>): EntryDescription {
  const p = (entry.payload && typeof entry.payload === "object" ? entry.payload : {}) as Record<string, unknown>;
  const label = friendlyTable(entry.table);
  const isDelete = entry.op === "delete";
  const kind = isDelete ? `Deleted ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
  const itemName = typeof p.item_id === "string" ? itemNames.get(p.item_id) : undefined;

  const details: string[] = [];
  const date = text(p.date);
  if (date) details.push(date);
  const meal = text(p.meal_tag);
  if (meal) details.push(meal);
  if (entry.table === "workout_logs" && typeof p.weight_kg === "number") details.push(`${p.weight_kg} kg`);
  if (entry.table === "period_logs") {
    const intensity = text(p.intensity);
    if (intensity) details.push(intensity);
  }
  if (entry.table === "stool_logs") {
    const at = text(p.logged_at, 40);
    if (at) details.push(new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  }

  const title =
    text(p.name) ??
    text(p.title) ??
    itemName ??
    text(p.content) ??
    text(p.body) ??
    (isDelete ? "An entry you removed" : entry.table === "stool_logs" || entry.table === "period_logs" ? label : "An entry");
  return { title, kind, details };
}

/** When the change was saved on this device, e.g. "19 Sep, 14:32". */
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}
