import type { FormEvent, ReactNode } from "react";

/**
 * The shared frame for every Lauva create/edit form — a title with a Cancel
 * control above grouped rows (`FormGroup`), passed as children. Keeping the
 * framing in one place is what stops these forms drifting apart.
 *
 * Journal's writing sheet (`JournalEntryForm`) deliberately opts out of
 * this — a journal entry shouldn't feel like filling in a form. Nothing
 * else should.
 */
export function FormShell({
  title,
  onSubmit,
  onCancel,
  headerActions,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  /** Extra controls sitting left of Cancel in the header — e.g. a Delete
   * affordance on an edit form. */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {headerActions}
          <button type="button" onClick={onCancel} className="min-h-9 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
            Cancel
          </button>
        </div>
      </div>
      {children}
    </form>
  );
}
