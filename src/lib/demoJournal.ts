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
    body: "Quiet day and I needed it. Long walk before it got hot, then read on the balcony most of the afternoon. Noticed I wasn't checking my phone every ten minutes for once. Went to bed calm, which hasn't happened much lately.",
  },
  {
    daysAgo: 2,
    title: "Small things that went right",
    body: "Rough week, so writing down the good bits before I forget them:\n\n- Called Mum and we actually laughed\n- Finished the thing at work I'd been dreading\n- Made a proper dinner instead of toast\n- Said no to the Saturday plan without feeling guilty\n\nNone of it is big. All of it helped.",
  },
  {
    daysAgo: 4,
    title: null,
    body: "Anxious most of the morning and I can't fully point to why. Deadline is part of it, but it felt bigger than that — that tight, everything-is-too-loud feeling. Went for a walk at lunch and it lifted a bit. Trying to remember that it always passes even when it doesn't feel like it will.",
  },
  {
    daysAgo: 7,
    title: "Weekend at the coast",
    body: "## Saturday\n\nDrove up with **no plan** and it was the best decision. Walked the whole length of the beach, found the little cafe again, sat for two hours.\n\n## Sunday\n\nWoke up early without an alarm. Swam even though the water was freezing. Came home tired in the good way.\n\n> \"You seem lighter,\" she said in the car. I think she's right.",
  },
  {
    daysAgo: 12,
    title: "Things I want to remember to do for myself",
    body: "- [x] Book the eye test I keep putting off\n- [ ] Start the evening wind-down earlier, screens off by ten\n- [ ] Message the old work friends about a catch-up\n- [ ] Say yes to one social thing a week, no more\n- [ ] Stop apologising for resting",
  },
  {
    daysAgo: 18,
    title: null,
    body: "Frustrated with myself for snapping at a friend over something small. Apologised properly and it was fine, but it stuck with me all evening. I think I've been running low for weeks and pretending I wasn't. Taking the weekend properly off — no plans, no catching up on anything.",
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
