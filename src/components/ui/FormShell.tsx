import type { FormEvent, ReactNode } from "react";

/**
 * The shared frame for every Lauva create/edit form — an iOS sheet header
 * (Cancel on the left, the title centred, Add/Done on the right) above
 * grouped rows (`FormGroup`), passed as children. Keeping the framing in one
 * place is what stops these forms drifting apart.
 *
 * Journal's writing sheet (`JournalEntryForm`) deliberately opts out of
 * this — a journal entry shouldn't feel like filling in a form. Nothing
 * else should.
 */
export function FormShell({
  title,
  onSubmit,
  onCancel,
  submitLabel,
  submitDisabled = false,
  busy = false,
  accent = "var(--ui-accent)",
  headerActions,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  /** "Add" for a new record, "Done" when editing one. */
  submitLabel: string;
  submitDisabled?: boolean;
  /** Shows "Saving…" in place of the label while a save is in flight. */
  busy?: boolean;
  /** Tint for Cancel and the submit button — the form's domain colour. */
  accent?: string;
  /** Extra controls sitting left of the submit button — e.g. a Delete
   * affordance on an edit form. */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 px-0.5">
        <button type="button" onClick={onCancel} className="hit-slop justify-self-start text-sm" style={{ color: accent }}>
          Cancel
        </button>
        <h3 className="truncate text-center text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <div className="flex items-center justify-self-end gap-3">
          {headerActions}
          <button
            type="submit"
            disabled={submitDisabled}
            className="hit-slop text-sm font-semibold whitespace-nowrap disabled:opacity-40"
            style={{ color: accent }}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
      {children}
    </form>
  );
}
