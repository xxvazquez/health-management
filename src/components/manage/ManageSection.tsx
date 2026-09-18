"use client";

import { createContext, useContext, type FormEvent, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

/** Which Settings section is open as its own screen (`null` = the list of
 * sections). Provided by the Settings page; each section reads it to decide
 * whether to render as a row, as the open screen, or not at all. */
export const ManageNavContext = createContext<{ active: string | null; open: (title: string) => void }>({
  active: null,
  open: () => {},
});

type SectionMode = "row" | "detail" | "inline" | "hidden";

/** `searching` (a live query on the Settings search box) shows every
 * matching section expanded in place instead of navigating into one. */
export function useSectionMode(title: string, searching: boolean): SectionMode {
  const { active } = useContext(ManageNavContext);
  if (searching) return "inline";
  if (active === null) return "row";
  return active === title ? "detail" : "hidden";
}

/** One tappable row in the Settings list: name on the left, a short summary
 * and a chevron on the right. */
export function SectionRow({ title, subtitle }: { title: string; subtitle?: string }) {
  const { open } = useContext(ManageNavContext);
  return (
    <button type="button" onClick={() => open(title)} className="flex min-h-11 w-full items-center gap-2 px-4 text-left">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </span>
      <span className="ml-auto flex min-w-0 items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        {subtitle && <span className="truncate text-sm">{subtitle}</span>}
        <ChevronIcon dir="right" size={14} />
      </span>
    </button>
  );
}

/** An iOS inset group: white rounded rows on the grey page, hairlines
 * between them (see `.inset-rows`). */
export const GROUP_CLS = "inset-rows rounded-xl border";
export const GROUP_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)" } as const;

/** Small grey caption under a group, like a Settings footnote. */
export function GroupNote({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 text-xs" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

/** "Add a …" as a Settings row: a borderless text field with the action on
 * the right, in its own group. */
export function AddRow({
  value,
  onChange,
  onSubmit,
  placeholder,
  label = "Add",
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  placeholder: string;
  label?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-11 items-center gap-2 rounded-xl border px-3.5" style={GROUP_STYLE}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={maxLength}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        style={{ color: "var(--text-primary)" }}
      />
      <button type="submit" disabled={!value.trim() || disabled} className="shrink-0 py-2 pl-2 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
        {label}
      </button>
    </form>
  );
}

/** A Settings section. In the list it is a single row; opened, its
 * children fill the screen under the page's back button and title; while
 * searching it expands in place under its own heading. */
export function CollapsibleManageCard({
  title,
  subtitle,
  forceOpen = false,
  bare = false,
  children,
}: {
  title: string;
  subtitle?: string;
  forceOpen?: boolean;
  /** Children lay out their own groups on the page instead of sitting in
   * one white card. */
  bare?: boolean;
  children: ReactNode;
}) {
  const mode = useSectionMode(title, forceOpen);
  if (mode === "hidden") return null;
  if (mode === "row") return <SectionRow title={title} subtitle={subtitle} />;
  return (
    <div className="flex flex-col gap-1.5">
      {mode === "inline" && (
        <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          {title}
        </h3>
      )}
      {bare ? (
        <div className="flex flex-col gap-3">{children}</div>
      ) : (
        <div className="rounded-xl p-4" style={{ background: "var(--surface-1)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
