import type { JournalEntry } from "@/lib/supabase/journal";

/** Example journal entries for signed-out visitors — same stance as
 * demoNotes / demoPersonalReminders: purely in-memory, anchored to today
 * so the dates always read as recent, never written anywhere. */
const DAY = 24 * 60 * 60 * 1000;

function isoDate(msOffset: number): string {
  const d = new Date(Date.now() + msOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ENTRIES: { daysAgo: number; title: string | null; body: string }[] = [
  {
    daysAgo: 1,
    title: null,
    body: "Slept badly again — woke up around 3 and couldn't get back down until it was almost light. Kept the morning slow, long walk after breakfast, felt more human by lunch. Note to self: no coffee after midday this week and see if it helps.",
  },
  {
    daysAgo: 3,
    title: "Physio check-in",
    body: "Second session with the new exercises. The band work is easier than last week and the pinch when I raise my arm past shoulder height is mostly gone. She added two more moves for the mornings.",
  },
  {
    daysAgo: 6,
    title: "Good day",
    body: "Everything just worked today. Cooked properly, got outside twice, stomach was calm. Writing it down so I remember it's possible.",
  },
  {
    daysAgo: 9,
    title: null,
    body: "Bloating back in the evening after the pasta. Third time this month I've noticed it on a heavy-wheat day. Going to try swapping in the buckwheat one for a couple of weeks and track it properly.",
  },
  {
    daysAgo: 14,
    title: "Restart",
    body: "Fell off the tracking for about ten days over the trip and it's honestly fine. Picking it back up today. The point isn't a perfect streak, it's noticing the patterns.",
  },
  {
    daysAgo: 20,
    title: "Appointment notes",
    body: "Bloods came back normal. Iron is at the low end of the range so worth keeping an eye on it. Follow up in three months, bring the symptom log.",
  },
];

export function buildDemoJournalEntries(): JournalEntry[] {
  return ENTRIES.map((e, i) => {
    const iso = new Date(Date.now() - e.daysAgo * DAY).toISOString();
    return {
      id: `demo-journal-${i + 1}`,
      date: isoDate(-e.daysAgo * DAY),
      title: e.title,
      body: e.body,
      createdAt: iso,
      updatedAt: iso,
    };
  });
}
