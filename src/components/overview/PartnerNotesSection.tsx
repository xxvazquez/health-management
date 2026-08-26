"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import { CategoryIcon, StarIcon } from "@/components/notes/icons";
import { NOTE_CATEGORY_LABEL, type NoteThread } from "@/lib/supabase/notes";

const ACCENT = "var(--series-magenta)";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short" });
}

/**
 * Overview's Partner Notes — the same `NoteThread` shape and category
 * icons the /notes page itself uses (`@/lib/supabase/notes`,
 * `@/components/notes/icons`), just a short, unread/favourite-first slice
 * of it rather than the full Inbox/Sent/Favourites/Archived tab set —
 * that's still /notes's job, this is a pointer at it. Every row links
 * straight to `/notes?thread=<id>`, which opens that exact thread (see
 * the Notes page's own read of the `thread` query param).
 */
export function PartnerNotesSection({ threads, partnerLabel, unreadCount }: { threads: NoteThread[]; partnerLabel: string | null; unreadCount: number }) {
  const preview = [...threads]
    .sort((a, b) => {
      // Unread first, then favourited, then most recent — the same
      // priority the section's name promises (recent/unread/favourite).
      if (a.isUnreadForMe !== b.isUnreadForMe) return a.isUnreadForMe ? -1 : 1;
      if (a.isFavouritedByMe !== b.isFavouritedByMe) return a.isFavouritedByMe ? -1 : 1;
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    })
    .slice(0, 5);

  return (
    <Card tier="supporting">
      <div className="mb-3 flex items-start justify-between gap-3">
        <CardTitle subtitle={partnerLabel ? `Recent notes with ${partnerLabel}.` : "Link a partner to start exchanging notes."}>
          Partner notes
        </CardTitle>
        <Link
          href="/notes"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: ACCENT }}
        >
          Open Notes{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </Link>
      </div>

      {preview.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {partnerLabel ? "No notes yet." : "Link a partner on the Notes page to send and receive private notes."}
        </p>
      ) : (
        <div className="flex flex-col">
          {preview.map((t) => (
            <Link
              key={t.id}
              href={`/notes?thread=${t.id}`}
              className="flex items-start gap-3 border-t py-2.5 pr-1 pl-0.5 text-left transition-colors first:border-t-0 hover:bg-[var(--page-plane)]"
              style={{ borderColor: "var(--gridline)" }}
            >
              <span className="mt-1 flex h-2 w-2 shrink-0 items-center justify-center">
                {t.isUnreadForMe && <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden="true" />}
              </span>
              <span className="mt-0.5 shrink-0" style={{ color: ACCENT }}>
                <CategoryIcon category={t.category} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm" style={{ fontWeight: t.isUnreadForMe ? 600 : 500, color: "var(--text-primary)" }}>
                    {t.subject || t.body.slice(0, 50)}
                  </span>
                  {t.isFavouritedByMe && <StarIcon filled size={11} />}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                  {t.isMine ? "You" : partnerLabel ?? "Partner"} · {NOTE_CATEGORY_LABEL[t.category]}
                </span>
              </span>
              <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {formatTimestamp(t.lastMessageAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
