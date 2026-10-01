"use client";

import { createContext, useContext, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronIcon } from "@/components/ui/icons";
import { CustomIcon } from "@/components/ui/customIcons";
import { TYPE_ACCENT } from "@/taxonomy/categories";

/** Which Settings section is open as its own screen (`null` = the list of
 * sections). Provided by the Settings page; each section reads it to decide
 * whether to render as a row, as the open screen, or not at all. */
export const ManageNavContext = createContext<{ active: string | null; open: (title: string) => void }>({
  active: null,
  open: () => {},
});

type SectionMode = "row" | "detail" | "inline" | "hidden";

/** Sections reached from a row inside another section's screen rather
 * than from the Settings list. */
export const SECTION_PARENT: Record<string, string> = {
  "Food products": "Food",
  "Workout plans": "Workout",
};

/** `searching` (a live query on the Settings search box) shows every
 * matching section expanded in place instead of navigating into one. */
export function useSectionMode(title: string, searching: boolean): SectionMode {
  const { active } = useContext(ManageNavContext);
  if (searching) return "inline";
  if (active === title) return "detail";
  return (SECTION_PARENT[title] ?? null) === active ? "row" : "hidden";
}

/** Each Settings section's icon tile, in the colour its part of the app
 * uses (Food's green, Workout's teal…) — like the tiles in iOS Settings. */
const SECTION_ICON: Record<string, { icon: string; color: string }> = {
  Food: { icon: "fork", color: TYPE_ACCENT.food },
  "Food products": { icon: "carton", color: TYPE_ACCENT.food },
  "Food targets": { icon: "flag", color: TYPE_ACCENT.food },
  Symptoms: { icon: "stomach", color: TYPE_ACCENT.outcome },
  Supplements: { icon: "pill", color: TYPE_ACCENT.supplement },
  Habits: { icon: "sparkle", color: TYPE_ACCENT.habit },
  Workout: { icon: "dumbbell", color: "var(--series-6)" },
  "Workout plans": { icon: "calendar", color: "var(--series-6)" },
  Coffee: { icon: "mug", color: "var(--series-slate)" },
  "Stool options": { icon: "drop", color: "var(--series-indigo)" },
  "Hidden links": { icon: "eye", color: TYPE_ACCENT.outcome },
  Doctors: { icon: "cross", color: "var(--series-2)" },
  "Doctor types": { icon: "clipboard", color: "var(--series-2)" },
  "Lab results": { icon: "flask", color: "var(--series-3)" },
  "Weight goal": { icon: "activity", color: "var(--series-4)" },
  "Reminder lists": { icon: "bell", color: "var(--series-berry)" },
  "Wishlist lists": { icon: "gift", color: "var(--series-magenta)" },
  Appearance: { icon: "sun", color: "var(--ui-accent)" },
  "Visible sections": { icon: "eye", color: "var(--ui-accent)" },
  "Your data": { icon: "folder", color: "var(--ui-accent)" },
};

/** One tappable row in the Settings list: icon tile and name on the left, a
 * short summary and a chevron on the right. */
export function SectionRow({ title, subtitle }: { title: string; subtitle?: string }) {
  const { open } = useContext(ManageNavContext);
  const tile = SECTION_ICON[title];
  return (
    <button type="button" onClick={() => open(title)} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
      {tile && (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ color: tile.color, background: `color-mix(in oklab, ${tile.color} var(--tint-pct), transparent)` }}
          aria-hidden="true"
        >
          <CustomIcon icon={tile.icon} size={15} />
        </span>
      )}
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
/** A one-row group that jumps to a Log tab — for heading back to log once
 * something is set up here. */
export function OpenInLogRow({ tab, label }: { tab: string; label: string }) {
  return (
    <div className={GROUP_CLS} style={GROUP_STYLE}>
      <Link href={`/log/?tab=${tab}`} className="flex min-h-11 items-center gap-2 px-3.5 text-sm" style={{ color: "var(--ui-accent)" }}>
        {label}
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          <ChevronIcon dir="right" size={14} />
        </span>
      </Link>
    </div>
  );
}

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
