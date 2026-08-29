import { isExpirationDue, isTaskDone, type ExpirationItem, type TaskItem } from "@/lib/reminders";
import type { DoctorFollowUpTask } from "@/lib/supabase/doctors";
import { addDaysToDate, todayLocalISODate } from "@/lib/aggregations/common";

/** How outstanding something is — the Attention band groups and orders by
 * this before anything else. */
export type AttentionTier = "overdue" | "today" | "soon";

export type AttentionContext = "Reminder" | "Expiry" | "Follow-up" | "Message";

export interface AttentionItem {
  key: string;
  tier: AttentionTier;
  label: string;
  context: AttentionContext;
  /** In-app route (with hash) for where this is actually handled. */
  href: string;
  /** ms since epoch of the due moment — orders items within a tier
   * (soonest-overdue first, soonest-upcoming first). */
  order: number;
}

const TIER_RANK: Record<AttentionTier, number> = { overdue: 0, today: 1, soon: 2 };

/** Days ahead a dated reminder / follow-up still counts as "coming up".
 * Expiry items carry their own `remindDaysBefore` window instead. */
const SOON_DAYS = 3;

export interface AttentionSources {
  personalReminders?: TaskItem[];
  householdReminders?: TaskItem[];
  personalExpiry?: ExpirationItem[];
  householdExpiry?: ExpirationItem[];
  followUps?: DoctorFollowUpTask[];
  unreadMessages?: number;
}

function tierForMoment(dueMs: number, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionTier | null {
  if (dueMs <= nowMs) return "overdue";
  if (dueMs <= todayEndMs) return "today";
  if (dueMs <= soonEndMs) return "soon";
  return null;
}

function reminderItems(tasks: TaskItem[], href: string, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const t of tasks) {
    if (t.isArchived || !t.dueAt || isTaskDone(t)) continue;
    const dueMs = new Date(t.dueAt).getTime();
    const tier = tierForMoment(dueMs, nowMs, todayEndMs, soonEndMs);
    if (!tier) continue;
    out.push({ key: `reminder:${t.id}`, tier, label: t.title, context: "Reminder", href, order: dueMs });
  }
  return out;
}

function expiryItems(items: ExpirationItem[], href: string, today: string): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const it of items) {
    if (!isExpirationDue(it, today)) continue;
    const tier: AttentionTier = it.expiresOn < today ? "overdue" : it.expiresOn === today ? "today" : "soon";
    out.push({
      key: `expiry:${it.id}`,
      tier,
      label: it.name,
      context: "Expiry",
      href,
      order: new Date(`${it.expiresOn}T00:00:00`).getTime(),
    });
  }
  return out;
}

function followUpItems(tasks: DoctorFollowUpTask[], today: string, nowMs: number, todayEndMs: number, soonEndMs: number): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const t of tasks) {
    if (t.completedAt || !t.dueDate) continue;
    const dueMs = new Date(`${t.dueDate}T00:00:00`).getTime();
    const tier: AttentionTier | null =
      t.dueDate < today ? "overdue" : t.dueDate === today ? "today" : tierForMoment(dueMs, nowMs, todayEndMs, soonEndMs);
    if (!tier) continue;
    out.push({ key: `followup:${t.id}`, tier, label: t.description, context: "Follow-up", href: "/doctors#followups", order: dueMs });
  }
  return out;
}

/**
 * The one cross-domain list of everything outstanding — overdue and due
 * reminders (personal + household), product expiry inside its remind
 * window, uncompleted doctor follow-ups, and unread partner messages.
 * Sorted overdue → due today → coming up, then soonest-first within each.
 */
export function buildAttentionItems(sources: AttentionSources, opts: { today?: string; now?: Date } = {}): AttentionItem[] {
  const today = opts.today ?? todayLocalISODate();
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const todayEndMs = new Date(`${today}T23:59:59.999`).getTime();
  const soonEndMs = new Date(`${addDaysToDate(today, SOON_DAYS)}T23:59:59.999`).getTime();

  const items: AttentionItem[] = [
    ...reminderItems(sources.personalReminders ?? [], "/personal#reminders", nowMs, todayEndMs, soonEndMs),
    ...reminderItems(sources.householdReminders ?? [], "/home#tasks", nowMs, todayEndMs, soonEndMs),
    ...expiryItems(sources.personalExpiry ?? [], "/personal#expiration", today),
    ...expiryItems(sources.householdExpiry ?? [], "/home#expiration", today),
    ...followUpItems(sources.followUps ?? [], today, nowMs, todayEndMs, soonEndMs),
  ];

  const unread = sources.unreadMessages ?? 0;
  if (unread > 0) {
    items.push({
      key: "messages:unread",
      tier: "soon",
      label: unread === 1 ? "1 unread message" : `${unread} unread messages`,
      context: "Message",
      href: "/notes",
      order: Number.MAX_SAFE_INTEGER,
    });
  }

  return items.sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.order - b.order || a.key.localeCompare(b.key),
  );
}

/** "2 overdue · 1 due today · 3 coming up" — for the collapsed band header. */
export function attentionSummary(items: AttentionItem[]): string {
  const counts: Record<AttentionTier, number> = { overdue: 0, today: 0, soon: 0 };
  for (const i of items) counts[i.tier] += 1;
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.today) parts.push(`${counts.today} due today`);
  if (counts.soon) parts.push(`${counts.soon} coming up`);
  return parts.join(" · ");
}
