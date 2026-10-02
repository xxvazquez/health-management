import { useEffect, useState } from "react";
import { useAuth } from "./supabase/AuthContext";

/** The row id the `health-import` function gives a day's imported entry —
 * a version-5-layout UUID from SHA-1 of `apple-health:<user>:<item>:<date>`.
 * Must match `stableId` in supabase/functions/health-import/index.ts. */
export async function appleHealthLogId(userId: string, itemId: string, date: string): Promise<string> {
  const name = `apple-health:${userId}:${itemId}:${date}`;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(name))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
