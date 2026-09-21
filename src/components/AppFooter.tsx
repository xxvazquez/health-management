import { Logo } from "@/components/Logo";
import { appVersionLabel } from "@/lib/appVersion";

/** Closes every page's content — same small brand mark and build
 * metadata everywhere, so it never competes with the page above it. */
export function AppFooter() {
  return (
    <footer className="mt-10 flex flex-col items-center gap-1.5 border-t pt-5 pb-1 text-center" style={{ borderColor: "var(--border-hairline)" }}>
      <Logo size={20} />
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {appVersionLabel()}
      </p>
    </footer>
  );
}
