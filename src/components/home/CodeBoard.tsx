"use client";

import { DatePicker } from "@/components/ui/DatePicker";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { isSpeechToTextSupported, useSpeechToText } from "@/lib/useSpeechToText";
import { TruncatedTooltip } from "@/components/ui/TruncatedTooltip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { FormShell } from "@/components/ui/FormShell";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ChevronIcon, ClockIcon } from "@/components/ui/icons";
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
      className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
      style={{
        background: listening ? "color-mix(in oklab, var(--status-critical) 12%, transparent)" : undefined,
        color: listening ? "var(--status-critical)" : "var(--ui-accent)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
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
  onDelete,
  onCancel,
}: {
  accent: string;
  initial?: HouseholdCode;
  onSave: (input: NewHouseholdCodeInput) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
    <FormShell title={initial ? "Edit code" : "New code"} onSubmit={handleSubmit} onCancel={onCancel} submitLabel={initial ? "Done" : "Add"} submitDisabled={saving || !canSave} busy={saving} accent={accent}>
      <FormGroup>
        <Field label="Code" plain>
          <div className="flex items-center gap-2">
            <input
              ref={codeInputRef}
              required
              autoFocus={!initial}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SUMMER20"
              maxLength={200}
              className={`${ROW_TEXT_CLS} min-w-0 flex-1 font-mono placeholder:font-sans`}
              style={ROW_STYLE}
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
        </Field>
        <Field label="Shop or name">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Where it works" maxLength={150} className={`${ROW_TEXT_CLS} font-medium`} style={ROW_STYLE} />
        </Field>
        <Field label={<>Comment <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <AutoGrowTextarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxRows={12}
            placeholder="What it's for, any conditions"
            maxLength={2000}
            className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
            style={ROW_STYLE}
          />
        </Field>
        <Field label={<>Expires on <span style={{ color: "var(--text-muted)" }}>· optional</span></>} inline>
          <DatePicker value={expiresOn} onChange={setExpiresOn} min={todayLocalISODate()} optional title="Expires on" />
        </Field>
      </FormGroup>

      {onDelete && (
        <FormGroup>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="flex min-h-11 w-full items-center justify-center text-sm font-medium" style={{ color: "var(--status-critical)" }}>
            Delete code
          </button>
          {confirmingDelete && (
            <ConfirmDialog
              title={`Delete ${initial?.code ?? "this code"}?`}
              message="This can't be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              onClose={() => setConfirmingDelete(false)}
            />
          )}
        </FormGroup>
      )}

      {error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </FormShell>
  );
}

function sortCodes(codes: HouseholdCode[], sort: SortMode): HouseholdCode[] {
  const byShop = (a: HouseholdCode, b: HouseholdCode) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const byExpiry = (a: HouseholdCode, b: HouseholdCode) => (a.expiresOn ?? NO_EXPIRY).localeCompare(b.expiresOn ?? NO_EXPIRY);
  return [...codes].sort((a, b) => (sort === "expiry" ? byExpiry(a, b) || byShop(a, b) : byShop(a, b) || byExpiry(a, b)) || b.createdAt.localeCompare(a.createdAt));
}

/** One code as a grouped-list row: the shop, then the code as a tinted
 * tap-to-copy chip, its comment and expiry. Tapping the rest of the row
 * opens it to edit or delete. */
function CodeItem({ code, accent, onOpen }: { code: HouseholdCode; accent: string; onOpen: () => void }) {
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
  const expiryColor = days == null ? "var(--text-muted)" : days < 0 ? "var(--status-critical)" : days <= 14 ? "var(--status-serious)" : "var(--text-muted)";

  return (
    <li className="relative flex items-start gap-3 px-3.5 py-2.5">
      <button type="button" onClick={onOpen} aria-label={`Edit ${code.name} code`} className="absolute inset-0" />
      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {code.name}
          </span>
          {code.expiresOn && (
            <span className="shrink-0 text-xs tabular-nums" style={{ color: expiryColor }}>
              {days != null && days < 0 ? "Expired" : "Expires"} {formatExpiresOn(code.expiresOn)}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy code ${code.code}`}
          className="pointer-events-auto flex w-fit max-w-full items-center gap-2 rounded-md px-2.5 py-1.5 transition-opacity hover:opacity-80"
          style={{ background: `color-mix(in oklab, ${accent} var(--tint-pct), transparent)` }}
        >
          <TruncatedTooltip text={code.code} className="font-mono text-sm tracking-wide" style={{ color: accent }} />
          <span className="shrink-0 text-xs font-medium" style={{ color: copied ? "var(--status-good)" : accent }}>
            {copied ? "Copied ✓" : "Copy"}
          </span>
        </button>
        {code.comment && (
          <p className="line-clamp-2 text-xs whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
            {code.comment}
          </p>
        )}
      </div>
      <span className="pointer-events-none relative shrink-0 self-center" style={{ color: "var(--text-muted)" }}>
        <ChevronIcon size={14} />
      </span>
    </li>
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

  const shown = useMemo(() => sortCodes(codes.filter((c) => matchesSearch(c, search)), sort), [codes, search, sort]);

  return (
    <div className="flex flex-col gap-3">
      {(composing || editingCode) && (
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
          onDelete={
            editingCode
              ? () => {
                  void onDelete(editingCode.id);
                  setEditingId(null);
                }
              : undefined
          }
          onCancel={() => {
            setComposing(false);
            setEditingId(null);
          }}
        />
      )}
      <div className="flex items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search codes…" className="min-w-0 flex-1 sm:w-64 sm:flex-none" />
        <button
          type="button"
          onClick={() => setSort((s) => (s === "shop" ? "expiry" : "shop"))}
          aria-label={sort === "shop" ? "Sorted by shop — tap to sort by expiry" : "Sorted by expiry — tap to sort by shop"}
          title={sort === "shop" ? "Sorted by shop A–Z" : "Sorted by expiring soon"}
          className="control-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {sort === "shop" ? (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 13l3 3 3-3M6 4v12M12 6h5l-5 5h5" />
            </svg>
          ) : (
            <ClockIcon size={16} />
          )}
        </button>
        <div className="sm:ml-auto">
          <PrimaryAction label="New code" accent={accent} onClick={() => setComposing(true)} />
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState what="codes" />
      ) : shown.length === 0 ? (
        <InlineEmpty
          title={codes.length === 0 ? "No codes yet" : "Nothing matches that search"}
          description={
            codes.length === 0
              ? "Tap New code to save a discount or promo code you both can use."
              : "Try a different search term."
          }
        />
      ) : (
        <ul className="inset-rows flex flex-col rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          {shown.map((code) => (
            <CodeItem key={code.id} code={code} accent={accent} onOpen={() => setEditingId(code.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
