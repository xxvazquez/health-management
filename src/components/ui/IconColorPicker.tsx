"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { iconNames } from "lucide-react/dynamic";
import { CUSTOM_COLOR_CHOICES, CUSTOM_ICON_KEYS, CustomIcon, ICON_SEARCH, LUCIDE_PREFIX, customColorValue, isCustomHex } from "./customIcons";
import { SearchField } from "./SearchField";

type LucideComponent = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

function pascalName(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** The full Lucide set, loaded only once a picker opens — one chunk, so
 * the grid doesn't fetch every icon separately. Aliases are dropped. */
let lucideCache: { name: string; Icon: LucideComponent }[] | null = null;
async function loadLucide() {
  if (lucideCache) return lucideCache;
  const { icons } = await import("lucide-react");
  const byName = icons as unknown as Record<string, LucideComponent>;
  const seen = new Set<LucideComponent>();
  const list: { name: string; Icon: LucideComponent }[] = [];
  for (const name of iconNames) {
    const Icon = byName[pascalName(name)];
    if (!Icon || seen.has(Icon)) continue;
    seen.add(Icon);
    list.push({ name, Icon });
  }
  lucideCache = list;
  return list;
}

/**
 * The icon + colour picker for any user-named grouping (Wishlist
 * categories, reminder lists, lab panels, doctor specialties, tracking
 * categories, …). Icons: Lauva's own glyphs first, then the full Lucide
 * set, both searchable. Colours: the brand hues plus any custom colour.
 * `null` means "use the default" for both, so `icon`'s "selected" state
 * treats `null` as `defaultIcon` (the first key unless the grouping has
 * its own built-in icon).
 */
export function IconColorPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
  accent,
  defaultIcon = CUSTOM_ICON_KEYS[0],
}: {
  icon: string | null;
  color: string | null;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
  accent: string;
  defaultIcon?: string;
}) {
  const [query, setQuery] = useState("");
  const [lucide, setLucide] = useState(lucideCache);
  useEffect(() => {
    if (!lucide) void loadLucide().then(setLucide);
  }, [lucide]);

  const q = query.trim().toLowerCase();
  const own = q ? CUSTOM_ICON_KEYS.filter((k) => (ICON_SEARCH[k] ?? k).includes(q)) : CUSTOM_ICON_KEYS;
  const words = q.split(/\s+/).filter(Boolean);
  const more = (lucide ?? []).filter((l) => words.every((w) => l.name.includes(w)));
  const current = icon ?? defaultIcon;

  const tile = (key: string, glyph: ReactNode, label: string) => {
    const selected = current === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={selected}
        aria-label={label}
        title={label}
        onClick={() => onIconChange(key === defaultIcon ? null : key)}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border transition-colors"
        style={{
          borderColor: selected ? accent : "var(--border-hairline)",
          background: selected ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "var(--surface-1)",
          color: selected ? accent : "var(--text-secondary)",
        }}
      >
        {glyph}
      </button>
    );
  };

  const caption = (text: string) => (
    <p className="col-span-full pt-1 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
      {text}
    </p>
  );

  return (
    <>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Icon
        </legend>
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${lucide ? lucide.length + own.length : ""} icons…`} className="w-full sm:w-64" />
        <div className="grid max-h-64 grid-cols-[repeat(auto-fill,2.25rem)] gap-1.5 overflow-y-auto overscroll-contain py-0.5">
          {own.length > 0 && caption("Lauva")}
          {own.map((key) => tile(key, <CustomIcon icon={key} size={17} />, key))}
          {more.length > 0 && caption("All icons")}
          {more.map(({ name, Icon }) => tile(`${LUCIDE_PREFIX}${name}`, <Icon size={18} strokeWidth={1.75} aria-hidden />, name.replace(/-/g, " ")))}
          {!lucide && (
            <p className="col-span-full py-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Loading more icons…
            </p>
          )}
          {lucide && own.length === 0 && more.length === 0 && (
            <p className="col-span-full py-1 text-xs" style={{ color: "var(--text-muted)" }}>
              No icons match &ldquo;{query.trim()}&rdquo;.
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {CUSTOM_COLOR_CHOICES.map((choice) => {
            const selected = color === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                aria-pressed={selected}
                aria-label={choice.key}
                onClick={() => onColorChange(selected ? null : choice.key)}
                className="tap-target flex h-7 w-7 items-center justify-center rounded-full"
                style={{ boxShadow: selected ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${choice.value}` : "none" }}
              >
                <span className="h-5 w-5 rounded-full" style={{ background: choice.value }} />
              </button>
            );
          })}
          <CustomColorSwatch color={color} onChange={onColorChange} />
        </div>
      </fieldset>
    </>
  );
}

/** Any colour at all, through the system colour picker. The value is only
 * saved once the picker is closed (`change`), not on every drag step. */
function CustomColorSwatch({ color, onChange }: { color: string | null; onChange: (color: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = isCustomHex(color);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => onChangeRef.current(input.value);
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, []);
  const fill = selected ? customColorValue(color)! : "conic-gradient(from 0deg, #e5484d, #f5a524, #e8d44d, #46a758, #0d9488, #3e63dd, #8e4ec6, #e5484d)";
  return (
    <label
      className="tap-target relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full"
      style={{ boxShadow: selected ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${color}` : "none" }}
      title="Custom colour"
    >
      <span className="h-5 w-5 rounded-full" style={{ background: fill }} />
      <input
        ref={inputRef}
        type="color"
        aria-label="Custom colour"
        defaultValue={selected ? color! : "#3e63dd"}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
