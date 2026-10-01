import { addDaysToDate, todayLocalISODate } from "@/lib/aggregations/common";
import type { CheckIn } from "@/lib/supabase/checkins";

/** A few weeks of example check-ins for the signed-out demo, so Log and
 * Trends → Cycle show what mood and energy look like. */
export function buildDemoCheckIns(): CheckIn[] {
  const today = todayLocalISODate();
  return Array.from({ length: 42 }, (_, i) => {
    const wave = Math.sin((i / 28) * Math.PI * 2);
    return {
      date: addDaysToDate(today, -i),
      mood: Math.max(1, Math.min(5, Math.round(3.5 + wave * 1.2))),
      energy: Math.max(1, Math.min(5, Math.round(3.2 + wave * 1.4 - (i % 7 === 6 ? 1 : 0)))),
      note: "",
    };
  });
}
