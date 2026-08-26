"use client";

import { useState, type FormEvent } from "react";
import { useDialogA11y } from "@/components/ui/useDialogA11y";
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, type NewNoteInput, type NoteCategory } from "@/lib/supabase/notes";
import { CategoryIcon } from "./icons";

const ACCENT = "var(--series-magenta)";

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

/** New top-level note only — replying happens inline in the thread view
 * (see NoteThreadView), which needs no category/subject picker since a
 * reply just continues the existing conversation. */
export function ComposeNoteDialog({
  open,
  onClose,
  partnerLabel,
  partnerId,
  onSend,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  /** What to show next to "To" — the partner's email, since that's the
   * only identity Lauva has for them (see partner.ts's own note on why
   * there's no display-name concept to draw from instead). */
  partnerLabel: string;
  partnerId: string;
  /** Injected rather than calling supabase/notes.ts's sendNote directly —
   * see NoteThreadView's own comment on why. */
  onSend: (input: NewNoteInput) => Promise<unknown>;
  onSent: () => void;
}) {
  const [category, setCategory] = useState<NoteCategory>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategory("note");
      setSubject("");
      setBody("");
      setError(null);
    }
  }

  const containerRef = useDialogA11y(open, onClose);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await onSend({ recipientId: partnerId, category, subject, body });
      onSent();
      onClose();
    } catch (err) {
      console.error("onSend failed", err);
      setError("Couldn't send that — try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            New note
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

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          To <span style={{ color: "var(--text-secondary)" }}>{partnerLabel}</span>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            {NOTE_CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className="flex flex-1 flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: active ? ACCENT : "var(--border-hairline)",
                    background: active ? "color-mix(in oklab, var(--series-magenta) 12%, var(--surface-1))" : "transparent",
                    color: active ? ACCENT : "var(--text-secondary)",
                  }}
                >
                  <CategoryIcon category={c} />
                  {NOTE_CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Subject (optional)
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              className="rounded-md border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Message
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="resize-none rounded-md border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </label>

          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
          {error && (
            <span className="text-xs" style={{ color: "var(--status-critical)" }}>
              {error}
            </span>
          )}
        </form>
      </div>
    </div>
  );
}
