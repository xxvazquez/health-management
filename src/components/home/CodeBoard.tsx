"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { isSpeechToTextSupported, useSpeechToText } from "@/lib/useSpeechToText";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { SearchField } from "@/components/ui/SearchField";
import { ListSection, SectionIcon } from "@/components/ui/ListSection";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import type { HouseholdCode, NewHouseholdCodeInput } from "@/lib/supabase/household";

type SortMode = "shop" | "expiry";

const NO_EXPIRY = "9999-12-31";

function formatExpiresOn(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Roughly how many days until the code lapses — for the amber "expiring
 * soon" tint, and for ordering. */
function daysUntil(date: string): number {
  return Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
}

function matchesSearch(code: HouseholdCode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return code.code.toLowerCase().includes(q) || code.name.toLowerCase().includes(q) || (code.comment ?? "").toLowerCase().includes(q);
}

function MicButton({ onStart, onText }: { onStart?: () => void; onText: (text: string) => void }) {
  const { start, listening } = useSpeechToText(onText);
  if (!isSpeechToTextSupported()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // Focus the target field first, in the same user gesture, so the
        // dictated text lands in an already-active input — no second tap.
        onStart?.();
        start();
      }}
      aria-label="Dictate the code"
      aria-pressed={listening}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors"
      style={{
        borderColor: listening ? "var(--status-critical)" : "var(--border-hairline)",
        background: listening ? "color-mix(in oklab, var(--status-critical) 10%, var(--surface-1))" : "var(--surface-1)",
        color: listening ? "var(--status-critical)" : "var(--text-secondary)",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="7.2" y="2.5" width="5.6" height="9" rx="2.8" />
        <path d="M4.5 10.2a5.5 5.5 0 0 0 11 0M10 15.7v2" />
      </svg>
    </button>
  );
}

function CodeForm({
  accent,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  initial?: HouseholdCode;
  onSave: (input: NewHouseholdCodeInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  function focusCodeEnd() {
    const el = codeInputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  const canSave = code.trim().length > 0 && name.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ code, name, comment, expiresOn: expiresOn || null });
    } catch (err) {
      console.error("household code save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={codeInputRef}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          maxLength={200}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 font-mono text-sm outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <MicButton
          onStart={focusCodeEnd}
          onText={(text) => {
            setCode(text.trim());
            // Re-assert focus + caret after the result so the field is ready
            // to edit straight away, no tap needed.
            requestAnimationFrame(focusCodeEnd);
          }}
        />
      </div>
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shop or name"
        maxLength={150}
        className="rounded-md border px-3 py-2 text-sm font-medium outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional)"
        maxLength={300}
        className="rounded-md border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Expires on
        <input
          type="date"
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
          min={todayLocalISODate()}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <span style={{ color: "var(--text-muted)" }}>optional</span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !canSave} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Save"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

interface ShopGroup {
  key: string;
  name: string;
  codes: HouseholdCode[];
  soonestExpiry: string;
}

function groupByShop(codes: HouseholdCode[], sort: SortMode): ShopGroup[] {
  const byShop = new Map<string, ShopGroup>();
  for (const c of codes) {
    const key = c.name.trim().toLowerCase() || "—";
    const g = byShop.get(key) ?? { key, name: c.name.trim() || "Unnamed", codes: [], soonestExpiry: NO_EXPIRY };
    g.codes.push(c);
    byShop.set(key, g);
  }
  const groups = [...byShop.values()];
  for (const g of groups) {
    g.codes.sort((a, b) => (a.expiresOn ?? NO_EXPIRY).localeCompare(b.expiresOn ?? NO_EXPIRY) || b.createdAt.localeCompare(a.createdAt));
    g.soonestExpiry = g.codes[0]?.expiresOn ?? NO_EXPIRY;
  }
  groups.sort((a, b) =>
    sort === "expiry"
      ? a.soonestExpiry.localeCompare(b.soonestExpiry) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return groups;
}

/** One code within a shop group — the code itself is an accent-tinted
 * tap-to-copy chip, with its comment and expiry beneath and the row
 * actions kept up at chip level. */
function CodeItem({ code, accent, onEdit, onDelete }: { code: HouseholdCode; accent: string; onEdit: () => void; onDelete: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(8);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("copy code failed", err);
    }
  }

  const days = code.expiresOn ? daysUntil(code.expiresOn) : null;
  const expiryColor = days == null ? null : days < 0 ? "var(--status-critical)" : days <= 14 ? "var(--status-serious)" : "var(--text-muted)";

  return (
    <div className="flex items-start gap-3 border-t py-2.5 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy code ${code.code}`}
          className="flex w-fit max-w-full items-center gap-2 rounded-md px-2.5 py-1.5 transition-opacity hover:opacity-80"
          style={{ background: `color-mix(in oklab, ${accent} 12%, transparent)` }}
        >
          <span className="truncate font-mono text-[13px] tracking-wide" style={{ color: accent }}>
            {code.code}
          </span>
          <span className="shrink-0 text-xs font-medium" style={{ color: copied ? "var(--status-good)" : accent }}>
            {copied ? "Copied ✓" : "Copy"}
          </span>
        </button>
        {code.comment && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {code.comment}
          </p>
        )}
        {code.expiresOn && (
          <span className="text-xs tabular-nums" style={{ color: expiryColor ?? "var(--text-muted)" }}>
            {days != null && days < 0 ? "Expired" : "Expires"} {formatExpiresOn(code.expiresOn)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {confirmingDelete ? (
          <>
            <button type="button" onClick={onDelete} className="rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
              Remove
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit code"
              title="Edit code"
              className="tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Remove code"
              title="Remove code"
              className="tap-target notebook-danger rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              <TrashIcon size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CodeBoard({
  codes,
  loading,
  error,
  accent,
  onCreate,
  onEdit,
  onDelete,
}: {
  codes: HouseholdCode[];
  loading: boolean;
  error: boolean;
  accent: string;
  onCreate: (input: NewHouseholdCodeInput) => Promise<void>;
  onEdit: (id: string, input: NewHouseholdCodeInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("shop");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingCode = editingId ? (codes.find((c) => c.id === editingId) ?? null) : null;

  const groups = useMemo(() => groupByShop(codes.filter((c) => matchesSearch(c, search)), sort), [codes, search, sort]);

  if (composing || editingCode) {
    return (
      <CodeForm
        key={editingCode?.id ?? "new"}
        accent={accent}
        initial={editingCode ?? undefined}
        onSave={async (input) => {
          if (editingCode) await onEdit(editingCode.id, input);
          else await onCreate(input);
          setComposing(false);
          setEditingId(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Search codes…" />
          <button
            type="button"
            onClick={() => setSort((s) => (s === "shop" ? "expiry" : "shop"))}
            className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
            title="Change sort order"
          >
            {sort === "shop" ? "Shop A–Z" : "Expiring soon"}
          </button>
        </div>
        <PrimaryAction label="New code" accent={accent} onClick={() => setComposing(true)} />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load codes — try again in a moment.
        </p>
      ) : groups.length === 0 ? (
        <InlineEmpty
          title={codes.length === 0 ? "No codes yet" : "Nothing matches that search"}
          description={
            codes.length === 0
              ? "Tap New code to save a discount or promo code you both can use."
              : "Try a different search term."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <ListSection
              key={g.key}
              label={g.name}
              count={g.codes.length > 1 ? g.codes.length : undefined}
              icon={
                <SectionIcon>
                  <path d="M3.5 8 10 3l6.5 5v8.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8Z" />
                  <path d="M8 17.5v-4.5h4v4.5" />
                </SectionIcon>
              }
            >
              <div className="flex flex-col">
                {g.codes.map((code) => (
                  <CodeItem key={code.id} code={code} accent={accent} onEdit={() => setEditingId(code.id)} onDelete={() => void onDelete(code.id)} />
                ))}
              </div>
            </ListSection>
          ))}
        </div>
      )}
    </div>
  );
}
