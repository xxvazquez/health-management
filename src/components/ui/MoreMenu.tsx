"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MoreMenuItem {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Starts a new section with a separator above it. */
  separated?: boolean;
  onClick: () => void;
}

/** The ⋯ button in a screen's title row that opens an iOS pull-down menu of
 * actions on what's shown (Mail's and Messages' pattern) — instead of a row
 * of loose icon buttons. Destructive actions sit last, in red. */
export function MoreMenu({ items, label = "More actions", disabled = false }: { items: MoreMenuItem[]; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="control-surface tap-target flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40"
        style={{ color: "var(--ui-accent)" }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15.5" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" aria-hidden="true" onClick={() => setOpen(false)} />
          <div role="menu" className="menu-surface absolute right-0 z-30 mt-1.5 min-w-56 p-1.5">
            {items.map((item, i) => (
              <div key={item.label}>
                {item.separated && i > 0 && <div className="mx-2.5 my-1 border-t" style={{ borderColor: "var(--border-hairline)" }} />}
                <button
                  ref={i === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-black/[0.04]"
                  style={{ color: item.destructive ? "var(--status-critical)" : "var(--text-primary)" }}
                >
                  <span className="flex-1">{item.label}</span>
                  {item.icon && (
                    <span className="flex w-4 justify-center" aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
