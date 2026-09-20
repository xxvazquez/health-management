/** The iOS on/off knob. Purely visual — put it inside a `role="switch"`
 * button (a whole 44px row is the tap target) rather than making the knob
 * itself the button. */
export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors"
      style={{ background: on ? "var(--ui-accent)" : "color-mix(in oklab, var(--text-muted) 32%, transparent)" }}
    >
      <span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? "translateX(16px)" : "none" }}
      />
    </span>
  );
}

/** A form row with a label on the left and the iOS switch on the right; the
 * whole 44px row toggles it. Use inside a `FormGroup`. */
export function SwitchRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm"
      style={{ color: "var(--text-primary)" }}
    >
      {label}
      <SwitchKnob on={on} />
    </button>
  );
}
