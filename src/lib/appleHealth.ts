import { useEffect, useState } from "react";
import { useAuth } from "./supabase/AuthContext";

/** A version-5-layout UUID from SHA-1 of `name` — the ids the
 * `health-import` function gives its rows. Must match `stableId` in
 * supabase/functions/health-import/index.ts. */
async function stableId(name: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(name))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The row id of a day's imported workout entry (Walking, Steps). */
export function appleHealthLogId(userId: string, itemId: string, date: string): Promise<string> {
  return stableId(`apple-health:${userId}:${itemId}:${date}`);
}

/** The row id of a day's imported weight or blood-pressure reading. */
export function appleHealthVitalId(userId: string, kind: "weight" | "bp", date: string): Promise<string> {
  return stableId(`apple-health:${userId}:${kind}:${date}`);
}

/** The id an Apple Health import for this exercise and day would have, or
 * null while signed out / still hashing. */
export function useAppleHealthLogId(itemId: string, date: string | undefined): string | null {
  const userId = useAuth().session?.user.id;
  const [result, setResult] = useState<{ key: string; id: string } | null>(null);
  const key = userId && date ? `${userId}:${itemId}:${date}` : null;

  useEffect(() => {
    if (!key || !userId || !date || !globalThis.crypto?.subtle) return;
    let cancelled = false;
    void appleHealthLogId(userId, itemId, date).then((id) => {
      if (!cancelled) setResult({ key, id });
    });
    return () => {
      cancelled = true;
    };
  }, [key, userId, itemId, date]);

  return result && result.key === key ? result.id : null;
}

/** Ids of the Vitals readings that came from Apple Health, among readings
 * taken at `measuredAt` (one possible import per local day). */
export function useAppleHealthVitalIds(kind: "weight" | "bp", measuredAt: string[]): Set<string> {
  const userId = useAuth().session?.user.id;
  const dates = Array.from(new Set(measuredAt.map(localDate))).sort().join(",");
  const key = userId && dates ? `${userId}|${kind}|${dates}` : null;
  const [result, setResult] = useState<{ key: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!key || !userId || !globalThis.crypto?.subtle) return;
    let cancelled = false;
    void Promise.all(dates.split(",").map((d) => appleHealthVitalId(userId, kind, d))).then((ids) => {
      if (!cancelled) setResult({ key, ids: new Set(ids) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, userId, kind, dates]);

  return result && result.key === key ? result.ids : EMPTY;
}

const EMPTY = new Set<string>();

function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
