"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { createJournalEntry, fetchJournalEntries, updateJournalEntry, type JournalEntry } from "@/lib/supabase/journal";

const PREVIEW_LENGTH = 100;

function formatJournalDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

function matchesSearch(entry: JournalEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (entry.title ?? "").toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
}

/**
 * A blank writing area, not a form with mood/tag pickers — the entire point
 * of Journal (per its own spec) is somewhere that doesn't force a thought
 * into a structured category. Shared between "new entry" and "edit an
 * existing one": `editing` is null for the former, the entry being opened
 * for the latter.
 */
function JournalEntryForm({
  editing,
  defaultDate,
  accent,
  onSaved,
  onCancel,
}: {
  editing: JournalEntry | null;
  defaultDate: string;
  accent: string;
  onSaved: (entry: JournalEntry) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = editing ? await updateJournalEntry(editing.id, { date, title, body }) : await createJournalEntry({ date, title, body });
      onSaved(saved);
    } catch (err) {
      console.error("journal save failed", err);
      setError("Couldn't save that — try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Date
          <input
            type="date"
            required
            value={date}
            max={todayLocalISODate()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
        </label>
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={150}
        className="rounded-md border px-3 py-2 text-sm font-medium outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />

      <textarea
        required
        autoFocus={!editing}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        placeholder="Write whatever's on your mind…"
        className="resize-y rounded-md border px-3 py-2.5 text-sm leading-relaxed outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? "Saving…" : "Save entry"}
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

export function JournalTab({ isDemoData, accent, onSignIn }: { isDemoData: boolean; accent: string; onSignIn: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(() => !isDemoData);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reset to "loading" whenever isDemoData flips (e.g. signing in while the
  // demo message was showing) — adjusted directly during render, same
  // pattern PushNotificationsToggle uses for its own reset-on-user-change,
  // rather than in the effect below (which would fire an extra post-mount
  // render just to toggle a boolean).
  const [knownIsDemoData, setKnownIsDemoData] = useState(isDemoData);
  if (isDemoData !== knownIsDemoData) {
    setKnownIsDemoData(isDemoData);
    setLoading(!isDemoData);
  }

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchJournalEntries()
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((err) => {
        console.error("fetchJournalEntries failed", err);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((e) => matchesSearch(e, search));
    const sorted = [...filtered].sort((a, b) => {
      const cmp = a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date);
      return oldestFirst ? cmp : -cmp;
    });
    return sorted;
  }, [entries, search, oldestFirst]);

  const editingEntry = editingId ? (entries.find((e) => e.id === editingId) ?? null) : null;

  function handleSaved(entry: JournalEntry) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id);
      return exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
    });
    setComposing(false);
    setEditingId(null);
  }

  if (isDemoData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 text-center" style={{ borderColor: "var(--border-hairline)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Sign in to keep a journal
        </p>
        <p className="max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
          Entries are saved to your account, so there&apos;s nothing to show until you&apos;re signed in.
        </p>
        <button type="button" onClick={onSignIn} className="rounded-md px-4 py-2 text-sm font-medium text-white" style={{ background: accent }}>
          Sign in
        </button>
      </div>
    );
  }

  if (composing || editingEntry) {
    return (
      <JournalEntryForm
        key={editingEntry?.id ?? "new"}
        editing={editingEntry}
        defaultDate={todayLocalISODate()}
        accent={accent}
        onSaved={handleSaved}
        onCancel={() => {
          setComposing(false);
          setEditingId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M16.5 16.5 13 13" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entries…"
              className="w-40 rounded-md border py-1.5 pr-2.5 pl-7 text-xs outline-none sm:w-56"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </div>
          <button
            type="button"
            onClick={() => setOldestFirst((v) => !v)}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
          >
            {oldestFirst ? "Oldest first" : "Newest first"}
          </button>
        </div>
        <button type="button" onClick={() => setComposing(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }}>
          + New entry
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : loadError ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your journal — try again in a moment.
        </p>
      ) : visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center" style={{ borderColor: "var(--border-hairline)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {entries.length === 0 ? "No entries yet" : "Nothing matches that search"}
          </p>
          <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
            {entries.length === 0 ? "Tap + New entry to write your first one." : "Try a different search term."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setEditingId(entry.id)}
              className="flex w-full items-start gap-3 border-t py-3.5 pr-3 pl-2 text-left transition-colors first:border-t-0 hover:bg-[var(--page-plane)]"
              style={{ borderColor: "var(--gridline)" }}
            >
              <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatJournalDate(entry.date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {entry.title || "Untitled"}
                </span>
                <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {preview(entry.body)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
