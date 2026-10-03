"use client";

import { useState } from "react";
import { FormGroup } from "@/components/ui/FormGroup";
import { SearchField, keepSearchFocus } from "@/components/ui/SearchField";
import { CheckIcon } from "@/components/ui/icons";

export interface PickerOption {
  value: string;
  label: string;
  /** Caption of the group the option is listed under. */
  group?: string;
}

/** A searchable list of choices, A–Z within each group, with a tick on the
 * chosen ones — the screen a picker row pushes to inside a sheet. */
export function PickerList({
  options,
  isSelected,
  onPick,
  placeholder,
  accent = "var(--ui-accent)",
}: {
  options: PickerOption[];
  isSelected: (value: string) => boolean;
  onPick: (value: string) => void;
  placeholder: string;
  accent?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = new Map<string, PickerOption[]>();
  for (const o of options) {
    if (q && !o.label.toLowerCase().includes(q)) continue;
    const key = o.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return (
    <div className="flex flex-col gap-4">
      <SearchField value={query} onChange={setQuery} placeholder={placeholder} className="w-full" />
      {groups.size === 0 && (
        <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No matches
        </p>
      )}
      {[...groups].map(([group, items]) => (
        <FormGroup key={group} title={group || undefined}>
          {[...items]
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((o) => {
              const selected = isSelected(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={keepSearchFocus}
                  onClick={() => onPick(o.value)}
                  aria-pressed={selected}
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span className="min-w-0 flex-1">{o.label}</span>
                  {selected && (
                    <span style={{ color: accent }}>
                      <CheckIcon size={14} />
                    </span>
                  )}
                </button>
              );
            })}
        </FormGroup>
      ))}
    </div>
  );
}
