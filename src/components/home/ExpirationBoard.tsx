"use client";

import { useMemo, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { EXPIRATION_BUCKET_LABEL, EXPIRATION_BUCKET_ORDER, expirationBucket, type ExpirationBucket, type ExpirationItem } from "@/lib/reminders";
import { isSpeechToTextSupported, useSpeechToText } from "@/lib/useSpeechToText";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";

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

function MicButton({ onText }: { onText: (text: string) => void }) {
  const { start, listening } = useSpeechToText(onText);
  if (!isSpeechToTextSupported()) return null;
  return (
    <button
      type="button"
      onClick={start}
      aria-label="Add product by voice"
      aria-pressed={listening}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
      style={{ borderColor: listening ? "var(--status-critical)" : "var(--border-hairline)", color: listening ? "var(--status-critical)" : "var(--text-secondary)" }}
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
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          maxLength={150}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm font-medium outline-none"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <MicButton onText={(text) => setName((prev) => (prev ? `${prev} ${text}` : text))} />
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
    <div className="group flex items-center gap-3 py-2.5 pr-1 pl-1">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>
          {item.name}
        </span>
        {item.remindDaysBefore > 0 && (
          <span
            className="flex shrink-0 items-center gap-1 text-[11px] whitespace-nowrap"
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
      </button>
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

  const grouped = useMemo(() => {
    const today = todayLocalISODate();
    const groups = new Map<ExpirationBucket, ExpirationItem[]>();
    for (const item of items) {
      const id = expirationBucket(item, today);
      (groups.get(id) ?? groups.set(id, []).get(id)!).push(item);
    }
    for (const list of groups.values()) list.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
    return groups;
  }, [items]);

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
      <div className="flex justify-end">
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + Add product
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load products — try again in a moment.
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            No products tracked yet
          </p>
          <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
            Tap + Add product to track its expiration date.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {EXPIRATION_BUCKET_ORDER.filter((bucket) => (grouped.get(bucket)?.length ?? 0) > 0).map((bucket) => {
            const emphatic = bucket === "expired" || bucket === "this_week";
            return (
              <div key={bucket} className="flex flex-col">
                <h3
                  className="px-1 pb-1.5 text-xs font-semibold tracking-wide uppercase"
                  style={{ color: emphatic ? bucketColor(bucket) : "var(--text-muted)" }}
                >
                  {EXPIRATION_BUCKET_LABEL[bucket]}
                  <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                    {grouped.get(bucket)!.length}
                  </span>
                </h3>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
