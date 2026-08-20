import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
}

/**
 * Standard modal-dialog keyboard behavior, shared by every `role="dialog"
 * aria-modal="true"` overlay (AccountPanel, BugReportDialog,
 * DuplicateItemDialog) instead of each reimplementing it: Escape closes the
 * dialog, Tab cycles within it instead of escaping into the page behind it,
 * and focus moves into the dialog on open and back to whatever triggered it
 * on close. Attach the returned ref to the dialog's outer container.
 *
 * `active` lets a component call this unconditionally (required by the
 * Rules of Hooks) even when it only renders the dialog conditionally —
 * pass `open`/`panelOpen`/etc. straight through; the effect no-ops while
 * false. `onClose` doesn't need to be memoized by the caller — the latest
 * value is read via a ref so an unstable function identity can't cause the
 * effect to re-run (which would re-trigger the open-focus behavior on
 * every render).
 */
export function useDialogA11y(active: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Kept current on every render, but from inside an effect rather than
  // during render itself — mutating a ref while rendering is no longer
  // allowed, even for this "always call the latest callback" pattern.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (container && !container.contains(document.activeElement)) {
      focusableElements(container)[0]?.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;
      const items = focusableElements(container);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return containerRef;
}
