/** The iOS on/off knob. Purely visual — put it inside a `role="switch"`
 * button (a whole 44px row is the tap target) rather than making the knob
 * itself the button. */
export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block h-7 w-[46px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? "var(--ui-accent)" : "color-mix(in oklab, var(--text-muted) 32%, transparent)" }}
    >
      <span
        className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? "translateX(18px)" : "none" }}
      />
    </span>
  );
}
