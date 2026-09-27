import { useId, type FormEvent, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";

/**
 * The shared frame for every Lauva create/edit form — an iOS sheet with the
 * form bar (Cancel on the left, the title centred, Add/Done on the right)
 * above grouped rows (`FormGroup`), passed as children. It opens over the
 * page it was started from, which stays in place behind it. Keeping the
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
  const titleId = useId();
  return (
    <Sheet title={title} titleId={titleId} onClose={onCancel} form={{ onSubmit, submitLabel, submitDisabled, busy, accent, headerActions }}>
      {children}
    </Sheet>
  );
}
