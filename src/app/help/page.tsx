type Entry = { title: string; body: string };

/** Plain documentation: topic groups, each a stack of entries that start
 * collapsed. Native <details> so it stays a server component and needs no
 * JS. Each entry says how one part of Lauva works — no FAQ theatre. */
const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "The main pages",
    items: [
      {
        title: "Log",
        body: "The tap-to-record screen. Pick a category, tap an item to log it, tap again to remove it. Covers food, symptoms, supplements, habits, stool, workout and cycle. Nothing here is a form — the entry time and date are editable, and the day stepper has a calendar for backdating.",
      },
      {
        title: "Overview",
        body: "The daily read-back. Today's summary at the top, then a recent-activity feed, a few personal trends, anything expiring soon, and a weekly or monthly review.",
      },
      {
        title: "Personal",
        body: "Your own journal, plain notes, reminders and product-expiry tracking — the things you write once and come back to.",
      },
      {
        title: "Doctors",
        body: "A history log of doctor visits you've already had — not an appointment scheduler. Log the date, reason, follow-up notes and follow-up tasks. Doctors and specialties are reusable and you pick them from a searchable list.",
      },
      {
        title: "Household",
        body: "The same notes, reminders and expiry, plus a shared list of discount codes, kept with a linked partner. Once linked, everything here is visible to both of you and either can act on it.",
      },
      {
        title: "Analytics",
        body: "One dashboard per area — Food, Supplements, Habits, Digestion, Workout, Cycle, Patterns — built automatically from your Log entries. Charts, streaks and patterns over time.",
      },
      {
        title: "Manage items",
        body: "Add, rename, archive or hide the specific foods, exercises and products offered when logging. Also where you rename or delete reminder lists, set exercise units, and choose which Log tabs and Analytics sections appear. Archiving hides an item from Log but keeps its history in every dashboard.",
      },
      {
        title: "Messages",
        body: "Private one-to-one messaging with your linked partner. Star a thread to favourite it for both of you.",
      },
    ],
  },
  {
    title: "Logging",
    items: [
      {
        title: "The day starts at 3 AM",
        body: "Anything logged between midnight and 3 AM counts as the previous day, with the time defaulting to 23:30. From 3 AM, the date and time behave normally.",
      },
      {
        title: "Symptom intensity",
        body: "Tap a symptom once for intensity 1, again for 2, again for 3. A fourth tap clears it. Symptoms are ordered by the date you say they happened, so backdating works.",
      },
      {
        title: "Meals",
        body: "The Food tab pre-selects Breakfast before noon, Lunch until 6 PM, Dinner after. Snack is never picked automatically. You can change the meal on any entry from the day's list.",
      },
      {
        title: "Sleep and other measures",
        body: "Sleep is in the Measures section at the bottom of the Habits tab. Tap a band — under 5h through 9h+ — to set it; tap the active band again to clear it.",
      },
      {
        title: "Spices",
        body: "The Spices food category is kept out of the nutrition-priority analysis, so logging seasonings doesn't skew it.",
      },
    ],
  },
  {
    title: "Reminders, notes and journal",
    items: [
      {
        title: "Reminder lists",
        body: "Reminders are grouped into named lists. The tabs on the Reminders screen switch between them; each reminder row has a small dropdown to move it to another list. Create, rename and delete lists on the Manage page.",
      },
      {
        title: "One-off vs recurring",
        body: "A reminder with no repeat is a one-off with an optional deadline. Set a repeat interval and it becomes recurring — completing it advances the next occurrence. Every completion is recorded; Undo reverses the last one.",
      },
      {
        title: "Journal",
        body: "A plain diary — a date, an optional title, and a body. Each entry has edit and delete buttons, and the list is searchable and sorts newest or oldest first.",
      },
      {
        title: "Notes",
        body: "Short free-text notes — a code, a measurement, anything. Searchable, edited in place.",
      },
    ],
  },
  {
    title: "Doctors",
    items: [
      {
        title: "The four tabs",
        body: "Appointments is the full log, newest first. Doctors is one page per saved doctor with all their visits. Specialties shows every visit for a type (e.g. all internists), across doctors. Follow-ups gathers every outstanding follow-up task in one list.",
      },
      {
        title: "Doctor type, rating and language",
        body: "These belong to the doctor, not to a single visit. Set them when you first add a doctor and change them any time from that doctor's page. A doctor rated 1 shows in red everywhere their name appears.",
      },
      {
        title: "Follow-ups: notes vs tasks",
        body: "Notes are free text about what was discussed. Tasks are concrete actions — 'do the CT scan' — each with an optional due date and an optional one-off reminder. Completed tasks stay under their appointment but move out of the outstanding list.",
      },
      {
        title: "Next appointment",
        body: "One date per specialty, not per doctor. Set it with the calendar on a specialty's page (or a doctor's page); it's the same shared date. It's a plain reminder of when you next need that type of doctor, not a booking.",
      },
    ],
  },
  {
    title: "Expiry and codes",
    items: [
      {
        title: "Product expiry",
        body: "Track a product by its expiry date and set 'remind N days before'. A bell on the row shows a reminder is set; a due item also appears under Expiring soon on Overview and, with notifications on, sends a push and an email. The list has its own search.",
      },
      {
        title: "Shared codes",
        body: "A Household list of discount and promo codes — the code, a shop or short name, an optional comment, an optional expiry date. Add by typing or by voice, tap a code to copy it, search and sort. A code with an expiry date drops off on its own once that date passes.",
      },
    ],
  },
  {
    title: "Partner, notifications and data",
    items: [
      {
        title: "Linking with a partner",
        body: "Open Messages, then either generate an invite code to send your partner or enter one they sent you. Only one of you needs to. Everything under Household then becomes shared.",
      },
      {
        title: "Notifications",
        body: "Turn them on from the Manage page. Reminders and due expiry items then send a push and, where configured, an email.",
      },
      {
        title: "“Not logged”",
        body: "Not logged means only that — never that something didn't happen. Days with nothing logged are left out of every percentage, not counted as zero.",
      },
      {
        title: "My Drive",
        body: "A read-only browser for your own Google Drive, if you choose to connect it.",
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
      </div>

      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            {group.title}
          </h2>
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {group.items.map((item) => (
              <details key={item.title} className="group border-t first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                <summary
                  className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.title}
                  <Chevron />
                </summary>
                <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {item.body}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
