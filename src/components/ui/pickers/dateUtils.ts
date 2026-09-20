/** Plain-string date helpers for the pickers. Dates travel as `YYYY-MM-DD`,
 * times as `HH:mm`, date-times as `YYYY-MM-DDTHH:mm` (what the native inputs
 * used to hand back), so callers keep their existing state shape. */

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function toISODate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

export function parseISODate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function todayISO(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** 0 = Monday … 6 = Sunday, for the first day of the month. */
export function mondayIndexOfFirst(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7;
}

export function splitDateTime(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function joinDateTime(date: string, time: string): string {
  return date ? `${date}T${time || "00:00"}` : "";
}

export function formatDateValue(value: string): string {
  const p = parseISODate(value);
  if (!p) return "";
  return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatMonthValue(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return "";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function monthName(m: number, style: "long" | "short" = "long"): string {
  return new Date(2000, m, 1).toLocaleDateString(undefined, { month: style });
}
