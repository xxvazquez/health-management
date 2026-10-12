"use client";

import { useEffect, useState } from "react";
import { onStorageProblem, type StorageProblem } from "@/lib/db/indexedDb";
import { onWriteRejected } from "@/lib/supabase/directWrite";
import { Button } from "@/components/ui/Button";

type Problem = StorageProblem | "rejected";

const MESSAGE: Record<Problem, string> = {
  rejected: "A change couldn't be saved, so it was undone. Try it again.",
  full: "This device is out of storage space, so your last change may not have been saved. Free up some space, then try again.",
  unavailable:
    "This browser isn't letting Lauva store data on this device (private browsing or blocked site data?), so your last change may not have been saved. Try again outside private browsing, or reload.",
};

/** Rendered once in the root layout. Appears when a local save fails because
 * the device is out of space or the browser refuses storage, or when the
 * server refuses a change a screen already showed as made — failures the
 * calling screen usually can't show itself. */
export function StorageErrorBanner() {
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => onStorageProblem(setProblem), []);
  useEffect(() => onWriteRejected(() => setProblem("rejected")), []);

  if (!problem) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium sm:px-6 lg:px-8"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span className="flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--status-critical)" }} />
        {MESSAGE[problem]}
      </span>
      <Button variant="tinted" size="xs" onClick={() => setProblem(null)} className="shrink-0">
        Dismiss
      </Button>
    </div>
  );
}
