"use client";

import { useMemo, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { expirationBucket, type ExpirationBucket, type ExpirationItem } from "@/lib/reminders";
import { isSpeechToTextSupported, useSpeechToText } from "@/lib/useSpeechToText";

const BUCKET_LABEL: Record<ExpirationBucket, string> = { expired: "Expired", soon: "Expiring soon", later: "Later" };
const BUCKET_COLOR: Record<ExpirationBucket, string> = { expired: "var(--status-critical)", soon: "var(--status-warning)", later: "var(--text-muted)" };
const BUCKET_ORDER: ExpirationBucket[] = ["expired", "soon", "later"];

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
    const groups: Record<ExpirationBucket, ExpirationItem[]> = { expired: [], soon: [], later: [] };
    for (const item of items) groups[expirationBucket(item, today)].push(item);
    for (const bucket of BUCKET_ORDER) groups[bucket].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
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
        <div className="flex flex-col gap-5">
          {BUCKET_ORDER.filter((bucket) => grouped[bucket].length > 0).map((bucket) => (
            <div key={bucket} className="flex flex-col gap-1">
              <h3 className="px-2 text-xs font-semibold tracking-wide uppercase" style={{ color: BUCKET_COLOR[bucket] }}>
                {BUCKET_LABEL[bucket]} ({grouped[bucket].length})
              </h3>
              <div className="flex flex-col">
                {grouped[bucket].map((item) => (
                  <div key={item.id} className="flex items-center gap-3 border-t py-3 pr-1 pl-2 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: BUCKET_COLOR[bucket] }}>
                      {formatExpiresOn(item.expiresOn)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-[var(--page-plane)]"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label="Edit product"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium"
                      style={{ color: "var(--status-critical)" }}
                      aria-label="Remove product"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
