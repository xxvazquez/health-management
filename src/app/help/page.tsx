type QA = { q: string; a: string };

/** Help is a plain FAQ: topic groups, each a stack of questions that start
 * collapsed. Native <details> so it stays a server component and needs no
 * JS — expand state is the browser's. */
const GROUPS: { title: string; items: QA[] }[] = [
  {
    title: "Getting around",
    items: [
      {
        q: "What are Log, Overview, Personal and Shared for?",
        a: "Log is the tap-to-record screen for food, symptoms, supplements, habits, workouts and cycle. Overview is the daily read-back — today's summary, recent activity, a few trends, anything expiring soon. Personal holds your own journal, notes, reminders and product-expiry tracking. Shared holds the versions of notes, tasks, expiry and discount codes you keep with a linked partner.",
      },
      {
        q: "Where do the Analytics dashboards come from?",
        a: "Each dashboard — Food, Supplements, Habits, Digestion, Workout, Cycle, Patterns — reads back what you've logged as charts, streaks and patterns. Nothing to set up; they fill in from your Log entries. The Spices food category is left out of the nutrition-priority analysis so seasonings don't skew it.",
      },
      {
        q: "What's on the Manage page?",
        a: "Add, edit or hide the specific foods, exercises and products offered when logging; rename or delete your reminder lists; set exercise units; and choose which Log tabs and Analytics sections appear.",
      },
    ],
  },
  {
    title: "Logging",
    items: [
      {
        q: "Why did my 1 AM entry land on yesterday?",
        a: "The day rolls over at 3 AM, not midnight. Anything logged between midnight and 3 AM counts as the day before, with the time defaulting to 23:30 — so a late entry lands on the day you're still awake in. From 3 AM, time and date behave normally again.",
      },
      {
        q: "How do symptom intensities work?",
        a: "Tap a symptom once to mark it at intensity 1, again for 2, again for 3; a fourth tap clears it. Recent activity and Overview order symptoms by the date you say they happened, not when you typed them, so backdating is fine.",
      },
      {
        q: "How does the meal picker choose?",
        a: "Breakfast before noon, Lunch until 6 PM, Dinner after. Snack is never picked automatically — choose it yourself. You can change the meal on any entry afterwards from the day's list.",
      },
      {
        q: "How do I record how long I slept?",
        a: "Sleep sits in the Measures section at the bottom of the Habits tab. Tap a band — under 5h through 9h+ — to set it; tap the active band again to clear it.",
      },
      {
        q: "Can I change an entry's time or date?",
        a: "Yes. Every entry's time is editable, and the day stepper has a tap-a-date calendar, so at 9 PM you can still log something that happened at 10 AM.",
      },
    ],
  },
  {
    title: "Reminders, notes & journal",
    items: [
      {
        q: "How do I move a reminder to another list?",
        a: "Each reminder row has a small list dropdown — pick a different list and it moves straight away, without opening the editor.",
      },
      {
        q: "Where do I rename or delete a list?",
        a: "On the Manage page. The tabs on the Reminders screen only switch between lists; they don't edit them.",
      },
      {
        q: "How does the Journal work?",
        a: "A plain diary on the Personal page — a date, an optional title, and a body. Each entry has visible edit and delete buttons, and the list is searchable and sorts newest or oldest first.",
      },
    ],
  },
  {
    title: "Expiry & codes",
    items: [
      {
        q: "How do product expiry reminders work?",
        a: "Track a product by its expiry date and set 'remind N days before'. A bell on the row shows a reminder is set; a due item also shows under Expiring soon on Overview and, once notifications are on, sends a push and an email. The list has its own search.",
      },
      {
        q: "What are Codes?",
        a: "A shared list of discount and promo codes on the Shared page — the code, a shop or short name, an optional comment and an optional expiry date. Add one by typing or by voice, tap a code to copy it, and search or sort the list. A code with an expiry date drops off on its own once that date passes.",
      },
    ],
  },
  {
    title: "With your partner",
    items: [
      {
        q: "How do I link with my partner?",
        a: "Open Messages. Generate an invite code to send them, or enter one they sent you — only one of you needs to. Once linked, everything on the Shared page is visible to both of you and either can act on it.",
      },
      {
        q: "What does starring a message do?",
        a: "It favourites the thread for both of you, so either person can find it under Favourites.",
      },
      {
        q: "What is My Drive?",
        a: "A read-only browser for your own Google Drive, if you choose to connect it.",
      },
    ],
  },
  {
    title: "Good to know",
    items: [
      {
        q: "Does “not logged” count as zero?",
        a: "No. Not logged means only that — never “didn't happen”. Days with nothing logged are left out of every percentage, not counted as zero.",
      },
      {
        q: "Is any of this medical advice?",
        a: "No. Lauva shows you your own logged data and descriptive patterns in it — nothing more. It does not diagnose, treat, or advise on any medical condition. Talk to a clinician about anything health-related.",
      },
    ],
  },
];

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform group-open:rotate-180"
      style={{ color: "var(--text-muted)" }}
      aria-hidden="true"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Help
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          How Lauva works, by topic. Tap a question to open it.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            {group.title}
          </h2>
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {group.items.map((item) => (
              <details key={item.q} className="group border-t first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.q}
                  <Chevron />
                </summary>
                <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
