"use client";

import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, type NewNoteInput, type NoteCategory } from "@/lib/supabase/notes";

const ACCENT = "var(--series-magenta)";

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
    <Sheet
      title="New message"
      titleId="compose-note-title"
      onClose={onClose}
      form={{ onSubmit: handleSubmit, submitLabel: "Send", busy: sending, busyLabel: "Sending…", submitDisabled: sending || !body.trim(), accent: ACCENT }}
      subtitle={
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          To <span style={{ color: "var(--text-secondary)" }}>{partnerLabel}</span>
        </p>
      }
    >
      <FormGroup>
        <Field label="Kind" inline>
          <select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory)} className={ROW_INLINE_CLS} style={{ color: ACCENT }}>
            {NOTE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NOTE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject · optional">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className={ROW_TEXT_CLS} style={ROW_STYLE} />
        </Field>
        <Field label="Message">
          <AutoGrowTextarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxRows={10}
            className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
            style={ROW_STYLE}
          />
        </Field>
      </FormGroup>

      {error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </Sheet>
  );
}
