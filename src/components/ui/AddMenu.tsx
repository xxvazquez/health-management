"use client";

import { useEffect, useRef, useState } from "react";
import { PrimaryAction } from "./PrimaryAction";

/** "+ Add" that opens an iOS pull-down menu of what to add — for a section
 * with more than one kind of thing to create (Agenda, Health → Visits,
 * Results). Picking a row runs its action and closes the menu. */
export function AddMenu({
  accent,
  label = "Add",
  options,
}: {
  accent: string;
  label?: string;
  options: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  // Opens toward the side with room: right-aligned under a button on the
  // right half of the screen, left-aligned under one on the left half.
  const [alignLeft, setAlignLeft] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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
    <div ref={rootRef} className="relative shrink-0">
      <PrimaryAction
        label={label}
        accent={accent}
        onClick={() => {
          const rect = rootRef.current?.getBoundingClientRect();
          setAlignLeft(rect ? rect.left + rect.width / 2 < window.innerWidth / 2 : false);
          setOpen((o) => !o);
        }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" aria-hidden="true" onClick={() => setOpen(false)} />
          <div role="menu" className={`menu-surface absolute z-30 mt-1.5 min-w-52 p-1.5 ${alignLeft ? "left-0" : "right-0"}`}>
            {options.map((o, i) => (
              <button
                key={o.label}
                ref={i === 0 ? firstItemRef : undefined}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  o.onClick();
                }}
                className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-black/[0.04]"
                style={{ color: "var(--text-primary)" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
