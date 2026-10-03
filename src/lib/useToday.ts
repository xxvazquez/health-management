"use client";

import { useEffect, useState } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";

/** Today's local date, kept current: an installed app can sit in memory
 * overnight, so it re-checks when the page comes back into view and once
 * a minute while it's open. */
export function useToday(): string {
  const [today, setToday] = useState(todayLocalISODate);

  useEffect(() => {
    const check = () => setToday(todayLocalISODate());
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const id = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearInterval(id);
    };
  }, []);

  return today;
}
