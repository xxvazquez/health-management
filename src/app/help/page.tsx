"use client";

import { useMemo, useState } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
import { SearchField } from "@/components/ui/SearchField";
import { InlineEmpty } from "@/components/ui/EmptyState";

type Entry = { title: string; body: string };

/** Plain documentation — how each part of Lauva works, grouped, collapsed
 * until you open one. The search box filters every entry by title and body
 * and shows the matches expanded, so finding one answer isn't a hunt
 * through 30 disclosures. */
const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "The areas",
    items: [
      {
        title: "Log",
        body: "The tap-to-record screen and the app's home. Pick a category, tap an item to log it, tap again to remove it — no forms. Covers food, symptoms, supplements, habits, stool, workout and cycle. The time and date on each entry are editable, and the day stepper has a calendar for backdating.",
      },
      {
        title: "Agenda",
        body: "What needs your attention, ordered by when it matters: Overdue, Today, Tomorrow, the next 7 days, Later, then no-date, then Done. Reminders, expiring products, doctor follow-ups and upcoming appointments all sit together — type, scope (mine / shared) and list are filter chips at the top, never the grouping.",
      },
      {
        title: "Trends",
        body: "Reading the data back — one dashboard per Log area (Food, Supplements, Habits, Digestion, Workout, Cycle) plus Patterns, switched by a tab bar. All built automatically from your Log entries; nothing to fill in.",
      },
      {
        title: "Health",
        body: "Everything about doctor visits and results, in four tabs: Visits (what to prepare before your next appointment, and a log of past ones), Results (blood and lab markers), Vitals (blood pressure and weight), Doctors (the people you see).",
      },
      {
        title: "Notes",
        body: "The things you keep with no deadline: Journal, Quick notes, Wishlist, and a shared Codes list. Journal and quick notes are private writing; a quick note can be shared with a linked partner one at a time.",
      },
      {
        title: "Messages",
        body: "Private one-to-one messaging with your linked partner. It appears in the navigation once a partner is linked. Star a thread to favourite it for both of you.",
      },
      {
        title: "Settings",
        body: "In the sidebar (and the account menu). Add, rename, archive or hide the foods, exercises and products offered when logging; edit reminder lists, wishlist lists, the Vitals weight goal, doctor types, doctors and stool chips; set exercise units; choose which Log tabs and Trends dashboards appear; export your data. One search box filters every section at once.",
      },
      {
        title: "My Drive",
        body: "A read-only browser for your own Google Drive, if you connect it. In the account menu.",
      },
    ],
  },
  {
    title: "Logging",
    items: [
      {
        title: "The day starts at 3 AM",
        body: "Anything logged between midnight and 3 AM counts as the previous day, with the time defaulting to 23:30. From 3 AM the date and time behave normally.",
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
        title: "Adding something that isn't in the list",
        body: "Tap \"+ Can't find it? Add it\" under the grid to add an item inline, or the \"Manage items\" link next to it to open Settings. Signed out, that button prompts you to sign in first.",
      },
      {
        title: "Spices",
        body: "The Spices food category is kept out of the nutrition-priority analysis, so logging seasonings doesn't skew it.",
      },
      {
        title: "“Not logged”",
        body: "Not logged means only that — never that something didn't happen. Days with nothing logged are left out of every percentage, not counted as zero.",
      },
    ],
  },
  {
    title: "Reminders, expiry and appointments (Agenda)",
    items: [
      {
        title: "One-off vs recurring",
        body: "A reminder with no repeat is a one-off with an optional deadline. Set a repeat interval and it becomes recurring — completing it advances the next occurrence. Every completion is recorded; the Done section has an Undo that reverses the last one.",
      },
      {
        title: "Reminder lists",
        body: "Reminders can belong to a named list (Bathroom, To Buy…). The list is a filter chip on Agenda, and you pick it when you create or edit a reminder. Create, rename and delete lists in Settings.",
      },
      {
        title: "Mine vs shared",
        body: "When you add a reminder you choose \"Just me\" or \"Shared\". A shared reminder is visible to a linked partner and either of you can complete it. Scope is set at creation — to change it, delete and re-add.",
      },
      {
        title: "Product expiry",
        body: "Track a product by its expiry date and set \"remind N days before\". It shows up in Agenda's urgency buckets as the date approaches and, with notifications on, sends a push and an email. Add one from the \"+\" button's chooser.",
      },
      {
        title: "Doctor follow-ups and next visits here",
        body: "Follow-up tasks and upcoming appointment dates are created in Health, but they also appear on Agenda (filter by \"Medical\") so everything with a deadline is in one list. You complete a follow-up from either place; the appointment date is edited only in Health.",
      },
    ],
  },
  {
    title: "Notes",
    items: [
      {
        title: "Journal",
        body: "A private diary for how a day went or how you're feeling — a date, an optional title, and a body you write in Markdown. The editor has a formatting toolbar (headings, bold, italic, lists, checklists, quotes, links) and a Preview switch; tapping an entry opens it as formatted text with Edit and Delete. The list is searchable, sorts newest or oldest first, and is grouped under month headers.",
      },
      {
        title: "Quick notes",
        body: "Short free-text notes — a code, a measurement, anything. A note is private until you open it and choose \"Share with partner\", which moves it to the shared list; \"Make private\" moves it back. A two-person glyph marks the shared ones, and a Mine / Shared filter appears once something is shared.",
      },
      {
        title: "Wishlist",
        body: "Saved links grouped into your own lists, each with an optional \"who it's for\". The title is fetched from the page automatically. Lists are created, renamed, recoloured and deleted from Settings (deleting a list also deletes its links). On Android you can share a link straight into Lauva; on iOS the Wishlist tab has an \"Add from your phone\" panel that sets up a Shortcut.",
      },
      {
        title: "Codes",
        body: "Discount and promo codes — the code, a shop or short name, an optional comment, an optional expiry date. Shared with a linked partner. Add by typing or by voice, tap a code to copy it. A code with an expiry date drops off on its own once that date passes.",
      },
    ],
  },
  {
    title: "Health",
    items: [
      {
        title: "Visits",
        body: "Two sections. \"Before your next visit\" holds your upcoming appointment dates (one per specialty, editable here) plus the observations and notes you've tagged for a visit, filterable by specialty. \"Past visits\" is the log of appointments you've had, newest first, each carrying its own follow-up tasks.",
      },
      {
        title: "Results",
        body: "An Overview — headline markers, anything out of its reference range first, per-panel trend charts and a compare overlay — and a Manage view for adding markers, panels and values. Enter a value on its own or a whole blood draw at once.",
      },
      {
        title: "Vitals",
        body: "Blood pressure and weight, entered often. Each has a trend chart; blood pressure also shows its ACC/AHA category. Set a target weight range in Settings and it draws as a band on the weight chart.",
      },
      {
        title: "Doctors",
        body: "Your saved doctors — tap one to expand its details and every visit. Rating, language and specialty belong to the doctor, not a single visit; a doctor rated 1 shows in red everywhere their name appears.",
      },
      {
        title: "Follow-ups: notes vs tasks",
        body: "Follow-up notes are free text about what was discussed. Tasks are concrete actions — \"do the CT scan\" — each with an optional due date and one-off reminder. A task shows under its appointment and, if dated, on Agenda's Medical filter. Completed tasks stay under their appointment.",
      },
      {
        title: "Doctor types",
        body: "The specialty list comes with common types built in. In Settings you can rename them, add your own, hide the ones you don't use, or delete them. An appointment keeps the type it was logged under no matter what you change later.",
      },
    ],
  },
  {
    title: "Partner and notifications",
    items: [
      {
        title: "Linking with a partner",
        body: "Open the account menu and choose \"Link a partner\", then either generate an invite code to send them or enter one they sent you. Only one of you needs to. Messages then appears in the navigation, you can share individual quick notes, and the wishlist and codes lists become shared.",
      },
      {
        title: "Notifications",
        body: "Turn them on from Settings. Reminders and due expiry items then send a push notification and, where email is configured, an email.",
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

function GroupCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      {children}
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
      {children}
    </h2>
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return null;
    return GROUPS.map((group) => ({
      title: group.title,
      items: group.items.filter((i) => i.title.toLowerCase().includes(q) || i.body.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [q]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading>Help</PageHeading>

      <SearchField value={query} onChange={setQuery} placeholder="Search help…" className="w-full sm:w-72" />

      {matches !== null ? (
        matches.length === 0 ? (
          <InlineEmpty title="Nothing matches that" description="Try a different word, or clear the search to browse by topic." />
        ) : (
          matches.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <GroupHeading>{group.title}</GroupHeading>
              <GroupCard>
                {group.items.map((item) => (
                  <div key={item.title} className="border-t px-4 py-3 first:border-t-0" style={{ borderColor: "var(--gridline)" }}>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {item.body}
                    </p>
                  </div>
                ))}
              </GroupCard>
            </section>
          ))
        )
      ) : (
        GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <GroupHeading>{group.title}</GroupHeading>
            <GroupCard>
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
            </GroupCard>
          </section>
        ))
      )}
    </div>
  );
}
