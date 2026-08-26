"use client";

import { CategoryIcon, StarIcon } from "./icons";
import { NOTE_CATEGORY_LABEL, type NoteThread, type NoteView } from "@/lib/supabase/notes";

const ACCENT = "var(--series-magenta)";

export function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const VIEW_EMPTY_COPY: Record<NoteView, { title: string; description: string }> = {
  inbox: { title: "Nothing in your inbox", description: "Notes your partner sends you will show up here." },
  sent: { title: "No notes sent yet", description: "Tap + New note to send your partner something." },
  favourites: { title: "No favourites yet", description: "Star a note to keep it easy to find here." },
  archived: { title: "Nothing archived", description: "Notes you archive will show up here." },
};

export function NoteThreadList({
  threads,
  loading,
  error,
  view,
  partnerLabel,
  onOpen,
}: {
  threads: NoteThread[];
  loading: boolean;
  error: boolean;
  view: NoteView;
  partnerLabel: string;
  onOpen: (id: string) => void;
}) {
  if (loading) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
        Couldn&apos;t load your notes — try again in a moment.
      </p>
    );
  }

  if (threads.length === 0) {
    const copy = VIEW_EMPTY_COPY[view];
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {copy.title}
        </p>
        <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-secondary)" }}>
          {copy.description}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {threads.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          className="flex w-full items-start gap-3 border-t py-3.5 pr-3 pl-2 text-left transition-colors first:border-t-0 hover:bg-[var(--page-plane)]"
          style={{ borderColor: "var(--gridline)" }}
        >
          <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
            {t.isUnreadForMe && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
          </span>
          <span className="mt-0.5 shrink-0" style={{ color: ACCENT }}>
            <CategoryIcon category={t.category} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm" style={{ fontWeight: t.isUnreadForMe ? 600 : 500, color: "var(--text-primary)" }}>
                {t.subject || t.body.slice(0, 60)}
              </span>
              {t.isFavouritedByMe && <StarIcon filled size={12} />}
            </span>
            <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {t.isMine ? `To ${partnerLabel}` : `From ${partnerLabel}`} · {NOTE_CATEGORY_LABEL[t.category]}
            </span>
          </span>
          <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {formatNoteTimestamp(t.lastMessageAt)}
          </span>
        </button>
      ))}
    </div>
  );
}
