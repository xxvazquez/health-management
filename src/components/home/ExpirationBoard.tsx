"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { EXPIRATION_BUCKET_LABEL, EXPIRATION_BUCKET_ORDER, expirationBucket, type ExpirationBucket, type ExpirationItem } from "@/lib/reminders";
import { isSpeechToTextSupported, useSpeechToText } from "@/lib/useSpeechToText";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { ListSection, SectionIcon } from "@/components/ui/ListSection";
import { SearchField } from "@/components/ui/SearchField";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { PrimaryAction } from "@/components/ui/PrimaryAction";

// Emphasis only where it earns its keep — Expired and this week read as
// urgent; everything further out is the same quiet muted tone.
function bucketColor(bucket: ExpirationBucket): string {
  if (bucket === "expired") return "var(--status-critical)";
  if (bucket === "this_week") return "var(--status-serious)";
  return "var(--text-muted)";
}

function formatExpiresOn(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function MicButton({ onStart, onText }: { onStart?: () => void; onText: (text: string) => void }) {
  const { start, listening } = useSpeechToText(onText);
  if (!isSpeechToTextSupported()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onStart?.();
        start();
      }}
      aria-label="Dictate the product name"
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

function ItemForm({
  accent,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  initial?: ExpirationItem;
  onSave: (name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? todayLocalISODate());
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(initial?.remindDaysBefore ?? 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function focusNameEnd() {
    const el = nameInputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name, expiresOn, Math.max(0, Number(remindDaysBefore) || 0));
    } catch (err) {
      console.error("household item save failed", err);
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
          ref={nameInputRef}
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          maxLength={150}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm font-medium outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <MicButton
          onStart={focusNameEnd}
          onText={(text) => {
            setName((prev) => (prev ? `${prev} ${text}` : text));
            requestAnimationFrame(focusNameEnd);
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Expires on
        <input
          type="date"
          required
          value={expiresOn}
          onChange={(e) => setExpiresOn(e.target.value)}
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Remind
        <input
          type="number"
          min={0}
          value={remindDaysBefore}
          onChange={(e) => setRemindDaysBefore(e.target.value)}
          className="w-16 rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        days before
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !name.trim()} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
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

function BellIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a4 4 0 0 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8Z" />
      <path d="M8.5 16a1.6 1.6 0 0 0 3 0" />
    </svg>
  );
}

/** One product line: name + expiry date, with always-visible edit/delete
 * icons and a two-step delete — same restrained treatment as the notes
 * cards. Shows a bell + cadence when a reminder is set, so it's clear one
 * is active. */
function ExpirationRow({
  item,
  dateColor,
  onEdit,
  onDelete,
}: {
  item: ExpirationItem;
  dateColor: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="group flex items-center gap-2 py-2.5">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {item.name}
      </button>
      {/* Metadata + actions sit together on the right so the expiry date
          reads next to the controls instead of stranded across a wide
          desktop row. */}
      {item.remindDaysBefore > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap"
          style={{ color: "var(--text-muted)" }}
          title={`Reminder set — ${item.remindDaysBefore} day${item.remindDaysBefore === 1 ? "" : "s"} before`}
        >
          <BellIcon />
          <span className="tabular-nums">{item.remindDaysBefore}d</span>
          <span className="hidden sm:inline">before</span>
        </span>
      )}
      <span className="shrink-0 text-xs whitespace-nowrap tabular-nums" style={{ color: dateColor }}>
        {formatExpiresOn(item.expiresOn)}
      </span>
      <div className={`flex shrink-0 items-center gap-1 ${confirmingDelete ? "opacity-100" : ""}`}>
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
              aria-label="Edit product"
              title="Edit product"
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
              style={{ color: "var(--text-muted)" }}
            >
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Remove product"
              title="Remove product"
              className="notebook-danger rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)]"
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

export function ExpirationBoard({
  items,
  loading,
  error,
  accent,
  onCreate,
  onEdit,
  onDelete,
}: {
  items: ExpirationItem[];
  loading: boolean;
  error: boolean;
  accent: string;
  onCreate: (name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  onEdit: (id: string, name: string, expiresOn: string, remindDaysBefore: number) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<ExpirationItem | null>(null);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const today = todayLocalISODate();
    const q = search.trim().toLowerCase();
    const groups = new Map<ExpirationBucket, ExpirationItem[]>();
    for (const item of items) {
      if (q && !item.name.toLowerCase().includes(q)) continue;
      const id = expirationBucket(item, today);
      (groups.get(id) ?? groups.set(id, []).get(id)!).push(item);
    }
    for (const list of groups.values()) list.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    return groups;
  }, [items, search]);

  const anyMatch = EXPIRATION_BUCKET_ORDER.some((bucket) => (grouped.get(bucket)?.length ?? 0) > 0);

  if (composing || editing) {
    return (
      <ItemForm
        accent={accent}
        initial={editing ?? undefined}
        onSave={async (name, expiresOn, remindDaysBefore) => {
          if (editing) await onEdit(editing.id, name, expiresOn, remindDaysBefore);
          else await onCreate(name, expiresOn, remindDaysBefore);
          setComposing(false);
          setEditing(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchField value={search} onChange={setSearch} placeholder="Search products…" />
        <PrimaryAction label="New product" accent={accent} onClick={() => setComposing(true)} />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load products — try again in a moment.
        </p>
      ) : items.length === 0 ? (
        <InlineEmpty title="No products tracked yet" description="Tap New product to track its expiration date." />
      ) : !anyMatch ? (
        <InlineEmpty title="Nothing matches that search" description="Try a different search term." />
      ) : (
        <div className="flex flex-col gap-3">
          {EXPIRATION_BUCKET_ORDER.filter((bucket) => (grouped.get(bucket)?.length ?? 0) > 0).map((bucket) => {
            const emphatic = bucket === "expired" || bucket === "this_week";
            return (
              <ListSection
                key={bucket}
                label={EXPIRATION_BUCKET_LABEL[bucket]}
                count={grouped.get(bucket)!.length}
                accent={emphatic ? bucketColor(bucket) : undefined}
                icon={
                  <SectionIcon>
                    {emphatic ? (
                      <>
                        <circle cx="10" cy="11" r="6" />
                        <path d="M10 8v3l2 1.6M6 3.5 3.5 6M14 3.5 16.5 6" />
                      </>
                    ) : (
                      <>
                        <rect x="4" y="5" width="12" height="11" rx="1.4" />
                        <path d="M4 8.4h12M7.6 3.4v3M12.4 3.4v3" />
                      </>
                    )}
                  </SectionIcon>
                }
              >
                <div className="flex flex-col divide-y divide-[color:var(--gridline)]">
                  {grouped.get(bucket)!.map((item) => (
                    <ExpirationRow
                      key={item.id}
                      item={item}
                      dateColor={emphatic ? bucketColor(bucket) : "var(--text-secondary)"}
                      onEdit={() => setEditing(item)}
                      onDelete={() => void onDelete(item.id)}
                    />
                  ))}
                </div>
              </ListSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
