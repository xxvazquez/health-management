import { useEffect, type ReactNode } from "react";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { ChevronIcon } from "./icons";

/** The header of a phone detail screen that replaces its list: "‹ <back>"
 * with the screen's actions and the menu button on one row, then the
 * screen's own large title — the same shape as a Log section. The page
 * hides its own title and tabs while this shows. */
export function DrillDownHeader({
  back,
  onBack,
  title,
  actions,
  accent = "var(--ui-accent)",
}: {
  back: string;
  onBack: () => void;
  title: ReactNode;
  actions?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full items-center gap-3">
        <button type="button" onClick={onBack} className="-ml-1 mr-auto flex min-h-9 items-center gap-0.5 text-sm font-medium" style={{ color: accent }}>
          <ChevronIcon dir="left" size={16} />
          {back}
        </button>
        {actions}
        <MobileMenuButton />
      </div>
      <h1 className="min-w-0 text-2xl leading-tight font-semibold tracking-tight text-balance" style={{ color: "var(--text-primary)" }}>
        {title}
      </h1>
    </div>
  );
}

/** Tells the page whether a phone detail screen is open, so it can hide its
 * own title and tabs; resets on unmount (a tab switch). */
export function useReportDrillDown(open: boolean, onChange?: (open: boolean) => void) {
  useEffect(() => {
    onChange?.(open);
    return () => onChange?.(false);
  }, [open, onChange]);
}
