/** The one "you're looking at example data" line, shown once near the top
 * of a page while signed out. Deliberately quiet and worded the same
 * everywhere — the sign-in call to action already lives in the banner
 * above every page, so this only has to say the data on screen isn't
 * yours. */
export function DemoNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs ${className}`.trim()} style={{ color: "var(--text-muted)" }}>
      Example data — nothing here is saved.
    </p>
  );
}
