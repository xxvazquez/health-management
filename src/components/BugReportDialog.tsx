"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { BUG_TYPES, bugReportingConfigured, submitBugReport, type BugType } from "@/lib/supabase/reportBug";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { Button } from "@/components/ui/Button";
import { NAV_LABEL } from "@/components/navLabels";
import { CloseIcon } from "@/components/ui/icons";

const ACCENT = "var(--series-1)";

const inputStyle = { borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" };

/** The one global "Report a bug" surface — opened from the nav's
 * BugReportButton (desktop rail and mobile drawer both trigger this same
 * instance), same pattern as AccountPanel. Rendered as a direct sibling of
 * the sticky nav rail rather than nested inside it: `position: sticky`
 * establishes its own stacking context, so a `position: fixed` dialog
 * nested inside it would render trapped beneath page content instead of
 * on top of everything, no matter its z-index. */
export function BugReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [bugType, setBugType] = useState<BugType>(BUG_TYPES[0]);
  const [location, setLocation] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the dialog transitions closed -> open, so a
  // stale previous report never lingers into the next one. Adjusted
  // directly during render (React's documented pattern for this) rather
  // than in an effect, which would fire an extra post-mount render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBugType(BUG_TYPES[0]);
      const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
      setLocation(NAV_LABEL[normalized] ?? pathname);
      setComment("");
      setSubmitted(false);
      setError(null);
    }
  }

  const containerRef = useDialogA11y(open, onClose);

  // Close on its own a beat after a successful send — the confirmation has
  // been read by then, and there's nothing left to do in the dialog.
  useEffect(() => {
    if (!submitted) return;
    const id = setTimeout(onClose, 1400);
    return () => clearTimeout(id);
  }, [submitted, onClose]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await submitBugReport({ bugType, location: location.trim(), comment: comment.trim() });
      setSubmitted(true);
    } catch (err) {
      // The banner stays generic on purpose (no raw error text shown to
      // the user), but logging the real reason means a failure is
      // actually diagnosable from devtools instead of a dead end.
      console.error("report-bug: submit failed", err);
      setError("Couldn't send the report — try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center justify-between">
          <h2 id="bug-report-title" className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Report a bug
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)", background: "var(--page-plane)" }}
          >
            <CloseIcon />
          </button>
        </div>

        {!bugReportingConfigured && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Bug reporting isn&apos;t set up for this deployment yet.
          </p>
        )}

        {bugReportingConfigured && submitted && (
          <p className="text-sm" style={{ color: "var(--status-good)" }}>
            Thanks — your report was sent.
          </p>
        )}

        {bugReportingConfigured && !submitted && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Type
              </span>
              <div className="flex flex-wrap gap-1.5">
                {BUG_TYPES.map((t) => {
                  const active = t === bugType;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBugType(t)}
                      aria-pressed={active}
                      className="rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
                      style={{
                        borderColor: active ? ACCENT : "var(--border-hairline)",
                        background: active ? "color-mix(in oklab, var(--series-1) 12%, var(--surface-1))" : "transparent",
                        color: active ? ACCENT : "var(--text-secondary)",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Location
              <input
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Log page, Digestion chart"
                className="rounded-md border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Comment (optional)
              <AutoGrowTextarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxRows={8}
                placeholder="Anything else that would help"
                className="resize-none rounded-md border px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
            </label>
            <Button type="submit" disabled={submitting} accent={ACCENT}>
              {submitting ? "Sending…" : "Send report"}
            </Button>
            {error && (
              <span className="text-xs" style={{ color: "var(--status-critical)" }}>
                {error}
              </span>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
