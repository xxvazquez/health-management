# Lauva

A personal food, symptom, supplement, habit, workout, and cycle tracker, with a dashboard for making sense of it afterwards. Live at [lauva.pl](https://lauva.pl).

## What it does

- **Overview** (`/overview`) — the home/at-a-glance page: Today (a chronological story of today plus a one-line recap of yesterday, across Food/Workout/Symptoms/Cycle/Notes), Recent Activity (one filterable cross-domain feed), Personal Trends (short cross-domain drift + "what stands out" facts, no charts), a monthly Calendar with a dot per active domain per day (tap a day for its story), Partner Notes, and a Weekly/Monthly Review of totals. Everything here reads data Log/Food/Workout/Cycle/Notes already own — nothing is computed twice.
- **Log** (`/log`) — tap-to-log entry for Food, Symptoms, Supplements, Habits, Stool, Workout, Cycle, and Journal, plus three private-organiser tabs after Journal: **Notes** (freeform title+body notes to yourself), **Reminders** (one-off tasks with a deadline and recurring chores, organised into named lists like iPhone Reminders — To Do, To Buy, etc. — plus an All view and "Done"/"Archived" sections; sorted overdue → due today → soonest → undated), and **Expiration** (products/supplements tracked by expiry date, grouped into seven calendar sections from Expired through "next year or later"). No forms for the logging tabs; pick a category, tap the item. Food and Supplements support multi-tapping with a tag (meal for Food, morning/afternoon/night for Supplements); every log type has a Time field so you can log something at 9pm that actually happened at 10am. Cycle tracks period days (intensity, collection method) on a calendar, with next-period predictions and cycle-length stats computed from your own recorded history, not a fixed assumed cycle length. Journal is a plain freeform diary — a date, an optional title, and a body, listed and searchable. Any tracked tab you don't use (e.g. Cycle) can be hidden from Manage — it disappears from Log and its analytics page both. Unlike Overview's Recent Activity (understanding what happened), Log's own day timeline is for managing records — editing, deleting, correcting a tag.
- **Analytics** (`/analytics`) — one page with a Log-style tab bar for every dashboard: Food, Supplements, Habits, Digestion, Workout, Cycle, Patterns (`/analytics#food` …). Charts and pattern analysis over what's been logged; Food additionally scores intake against a research-informed model and flags what's underrepresented, without diagnosing anything. Each tab is shown/hidden by the same Manage toggle its Log tab uses.
- **Manage** (`/manage`) — add, rename, archive, or delete items and categories for all five item-backed types, set per-exercise units, and toggle which tracked domains show up in Log/Analytics at all.
- **My Drive** (`/my-drive`) — read-only browser for the signed-in Google account's own Google Drive.
- **Help** (`/help`) — a one-page plain-language reference for what each part of the app does.
- **Notes** (`/notes`) — private notes between two linked partner accounts, separate from personal logging. Link once with a short invite code (Manage-style — no invite emails), then send a note with a category (Note/Reminder/Appreciation/Question), reply to build a simple thread, favourite, mark read/unread, and archive. Instead of a mail per message, a once-a-day digest ("you have N unread notes from …") goes out if there's anything unread.
- **Home** (`/home`) — the shared, partner-facing counterpart to Log's private Notes/Reminders/Expiration tabs (reuses the Connect pairing): shared notes, shared tasks either of you can complete (edit, undo, archive, and optionally assign to one of you), and a product **Expiration** tracker (add by text or voice, grouped into seven calendar sections — Expired, this week, next week, next month, in two months, in six months, next year or later) with email+push reminders. Every shared item shows who completed it and when.
- Works fully offline; syncs to Supabase when signed in; installable as a PWA.

## Tech stack

- **Next.js 16** (App Router, static export — `output: "export"` in `next.config.ts`), React 19, TypeScript
- **Tailwind CSS 4**
- **Supabase** (Postgres + Auth + Row-Level Security + Edge Functions) as the only backend
- **IndexedDB** (via `idb`) as the local cache/offline store
- **Recharts** for charts, **Vitest** for tests

## Project structure

```
src/
  app/                  route pages (App Router) — one folder per page
  components/           UI components (ui/, charts/, auth/, log/, analytics/, icons/, reminders/, home/)
  lib/
    aggregations/       per-dashboard chart/stat computation, one module each
    db/indexedDb.ts     local cache: schema, CRUD, the write lock
    supabase/           Supabase client, sync (push+pull), outbox drain
    canonical/          turns items+logs into the shape dashboards read
  taxonomy/             category definitions, food classification, naming rules
supabase/
  schema.sql            full DDL + RLS policies — the source of truth for the data model
  functions/            Edge Functions (bug report email; reminder + notes-digest cron)
  tests/rls.test.sql    automated RLS isolation tests (CI only, never a real project)
docs/
  data-model.md         readable map of the schema — grouped ER diagrams, RLS shapes
  palette.svg           brand palette reference
```

## Running it locally

Needs Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Logging works fully offline out of the box — everything is cached in the browser via IndexedDB. To sync across devices, set up a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the account menu.

## Environment variables

All optional — without them the app just runs local-only with fewer features. See `.env.local.example` for the full list with explanations:

| Variable | Enables |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cloud sync and sign-in |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Reminder push notifications (also needs `VAPID_PRIVATE_KEY` as a Supabase secret) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | My Drive (Google Drive browsing) |

## Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef5f3", "primaryBorderColor": "#5c8a7a",
  "primaryTextColor": "#24313a", "lineColor": "#7d9a90",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
flowchart LR
    subgraph browser["Browser — Next.js PWA (static export)"]
        ui["React UI"]
        idb[("IndexedDB<br/>item/log/diary cache")]
        outbox["Outbox<br/>(queued writes)"]
        ui --> idb
        ui --> outbox
    end
    subgraph supa["Supabase project"]
        pg[("Postgres + RLS")]
        auth["Auth"]
        ef["Edge Functions"]
    end
    outbox -->|"drain, retry/backoff"| pg
    pg -->|"pull: sign-in / focus / reconnect / 60s"| idb
    ui --> auth
    ui -.->|"Notes, Journal, Reminders<br/>(direct, no offline)"| pg
    ef -->|"reminder + notes-digest cron"| pg
    ef --> resend["Resend (email)"]
    ef --> push["Web Push"]
```

**Supabase is the only source of truth; IndexedDB is a synced cache.** IndexedDB is wiped and repopulated from Supabase on sign-in, whenever the tab regains focus, on reconnect, and on a 60-second timer while the tab is visible — so a change made on another device shows up here within about a minute without needing to background/refocus this tab first. Every pull filters `.eq("user_id", ...)` explicitly rather than trusting RLS alone to scope rows — belt-and-suspenders after a real incident where a table's RLS was live but a retrofitted `enable row level security` migration hadn't actually been run against the deployed project, and rows briefly weren't scoped per account. Every write goes to IndexedDB first (so the UI never waits on the network) and is queued in a small outbox; a background drain sends queued writes to Supabase with retry/backoff, so nothing typed offline is lost. A write that's permanently rejected (not just offline) shows up in a banner (`src/components/SyncStatusBanner.tsx`) naming what failed and why, with a Retry button — the local record was never at risk, only its cloud copy is stuck; retrying (or auto-repairing) an item also retries any of its logs/notes that were only stuck waiting on it. A single write lock (`withDataLock` in `indexedDb.ts`) keeps a cloud pull from ever running in the middle of a local write.

**Items, logs, diary, categories** — one consistent shape across Food, Supplement, Habit, Symptom, and Workout: an *item* (what you track, with a category) has many *logs* (one per occurrence) and an optional *diary* entry per day (a note). Categories are shared per item type and editable from Manage; a type with no custom categories yet falls back to the built-in defaults in `src/taxonomy/categories.ts`, and once any real row exists the database is the only source of truth from then on. Archiving hides an item from Log without touching its history; deleting is only allowed once an item has zero logged history (every `*_logs`/`*_diary` foreign key is `on delete restrict`).

**Stool and Workout logs don't fit that shape and keep their own tables** (`stool_logs`, `workout_logs`) — a bowel movement or a lift isn't "an item plus an occurrence." Workout still gets a real item type (`workout_items`: name, category, archive state, a unit like kg/minutes/reps) for the Manage page and the Log page's per-exercise rows, and `workout_logs.item_id` is a real foreign key to it, same as every other log table — the app layer just keeps working with a plain exercise name, resolving to/from `item_id` only at the Supabase sync boundary (`buildWorkoutLogRow`/`pullFromCloud` in `sync.ts`).

**Cycle is the same standalone shape as Stool** (`period_logs`, one row per calendar day flagged as a period day — no item/category of its own) but nothing about cycle length, cycle day, or predictions is stored: `src/lib/aggregations/cycle.ts` derives all of it from the recorded dates on the fly (grouping consecutive dates into periods, then reading days-between-period-starts as cycle length), using a recent-cycles window rather than entire history so predictions track how the cycle actually behaves lately, not an average smoothed over years.

**Notes has no offline mode and isn't part of the IndexedDB sync system above** — a note only means anything once it reaches your partner's real account, so it talks to Supabase directly (`src/lib/supabase/notes.ts` / `partner.ts`) rather than going through the write-local-first outbox. Two accounts become "partners" by redeeming a short-lived invite code into a `partner_links` row (`redeem_partner_invite`, a `security definer` Postgres function — the only place in this schema one user's action creates a row naming a *different* user, so it needs to bypass RLS deliberately rather than relying on a policy); every note is then one row in `notes`, sender/recipient RLS-checked against that link on insert. A reply is just another `notes` row with `thread_root_id` pointing at the top-level note — no separate replies table — with a trigger (`notes_touch_thread`) keeping the thread's `last_message_at` and each side's own read timestamp current as messages arrive, which is what makes a thread go unread-again for the other person without a full chat-style read-receipt system. Email notification is a **once-a-day digest**, not a mail per message: the reminder cron's third phase (see Deployment) counts each linked user's unread threads after 09:00 Europe/Warsaw (override with `DIGEST_TIMEZONE`) and sends one "you have N unread notes from …" mail + push, tracked by `notes_digest_state` so it fires at most once a day. It needs a user's *email* (via the service-role client, since `auth.users` isn't queryable by a regular client) but never includes any note's subject or body.

**Log's Journal / Notes / Reminders / Expiration tabs share a "written once, not logged repeatedly" pattern** — all four talk to Supabase directly (`src/lib/supabase/journal.ts`, `personalReminders.ts`; wired for the page by `src/lib/usePersonalReminderBoards.ts`) rather than through the write-local-first outbox, and none has an offline mode. Journal (`journal_entries`) is a freeform diary, unrelated to the per-item diary notes above. Notes/Reminders/Expiration are the **private** counterparts of the `/home` page's shared versions, and reuse the exact same `NoteBoard` / `TaskBoard` / `ExpirationBoard` components — `personal_notes` / `personal_tasks` / `personal_items` are owner-only (`auth.uid() = user_id`), where the `household_*` tables reuse Connect's `partner_links` pairing via a small `is_household_member(target_user_id)` SQL helper so a row is visible/editable by its creator *and* their one linked partner with no "share this" step.

Personal reminders additionally have **lists** (`reminder_lists`, owner-only; `personal_tasks.list_id` is a composite FK, `on delete set null` so deleting a list drops its tasks back to the default "Reminders" bucket rather than removing them) — Home tasks have no lists. One `*_tasks` table covers both a one-off deadline and a recurring chore: `recurrence_days` null means one-off (`last_completed_at`, once set, means done); set means recurring (`due_at` is the *next* occurrence, advanced by `recurrence_days` on every completion). Every completion also gets its own `*_task_completions` row (the denormalized `last_completed_at`/`_by` on the task exists only so the list view needs no join); "Undo" drops the latest completion row and, for a recurring task, moves `due_at` back. `is_archived` retires a task from the active list into an "Archived" section without deleting its history. Reminders reuse the push/email plumbing rather than adding new: `supabase/functions/reminder-cron` (see Deployment) scans `personal_tasks`/`household_tasks` (skipping archived) and `personal_items`/`household_items` for due, not-yet-reminded rows and sends a push + email — `reminder_sent_at` is the sole idempotency guard, cleared when a recurring task's `due_at` advances. Voice input on Expiration is the browser's own Web Speech API (`src/lib/useSpeechToText.ts`), feature-detected — no server, no dependency.

**Which domains show up is a local, per-device preference, not synced data.** `src/lib/visibleDomains.tsx` holds a `VisibleDomainsProvider` (localStorage-backed) that Log and Nav both read to hide a tracked type — and its analytics page — everywhere at once; deliberately not pushed to Supabase, since "I don't track this" is a statement about this device/person using the account, not a fact about the data itself.

**PWA / offline shell**: `public/manifest.webmanifest` + `public/sw.js` cache the app shell (HTML/JS/CSS) separately from IndexedDB's data cache. The service worker's cache name bakes in the deploy's git SHA, substituted by `.github/workflows/deploy.yml`, so every deploy is a genuinely new cache instead of accumulating old assets.

## Data model

Everything is stored in one Supabase (Postgres) project, one row per user,
scoped by row-level security. [`supabase/schema.sql`](supabase/schema.sql)
is the authoritative definition; **[`docs/data-model.md`](docs/data-model.md)
is the readable map** — grouped ER diagrams (tracked-domain core,
standalone logs, Connect, Reminders), the RLS policy shapes, and the
`security definer` functions.

The invariant worth knowing up front: every foreign key between user-owned
tables is a **composite key on `(user_id, id)`**, not `id` alone (category
FKs also carry `item_type`), so a row structurally can't reference another
user's data — or the wrong item type — regardless of RLS. Nothing about
the cycle is stored beyond flagged period days; length/day/predictions are
all derived at the app layer.

## Development commands

```bash
npm run dev        # local dev server
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run test         # vitest
npm run build        # production build (also type-checks)
```

`.github/workflows/check.yml` runs lint, typecheck, test, and build on every push/PR, plus a separate `rls` job that applies `schema.sql` to a throwaway Postgres container and runs [`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql) — automated proof that RLS actually stops one user from reading, writing, or referencing another's data, for every table. That only proves the schema file itself is correct, not that a live project's RLS is actually turned on — the app-side `npm run test` suite (`sync.test.ts`) separately covers the client's own `.eq("user_id", ...)` scoping, including a full sign-out/sign-in account switch.

## Deployment

Push to `main` → `.github/workflows/deploy.yml` builds and publishes to GitHub Pages at the domain in `public/CNAME`. No separate deploy step; a merge to `main` is the deploy.

Supabase Edge Functions (`supabase/functions/`) are deployed separately by `.github/workflows/deploy-functions.yml`, triggered whenever that folder changes. Their secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, plus whatever each function needs — `RESEND_API_KEY`/`BUG_EMAIL`/`BUG_REPORT_FROM` for bug reports, `NOTES_FROM`/`REMINDERS_FROM` for the digest and reminder emails, optional `DIGEST_TIMEZONE`, `VAPID_PRIVATE_KEY` for push) are pushed into Supabase's own secret store by that same workflow — only ones that actually have a value, so an unset GitHub secret can't wipe one set by hand in the dashboard. One gotcha: changing a secret's *value* in GitHub doesn't retrigger the workflow (no file changed) — run it manually from the Actions tab.

**Email sending requires a verified Resend domain.** The reminder cron sends to a *user's* address (a partner, or whoever a task is for), not a fixed one. Resend's shared `onboarding@resend.dev` sender only delivers to the Resend account's own address, so those emails silently fail until you [verify a domain](https://resend.com/domains) (e.g. `lauva.pl`) and set `NOTES_FROM` / `REMINDERS_FROM` to an address on it (`Lauva <notes@lauva.pl>`). `report-bug` is unaffected — it mails `BUG_EMAIL`, the account owner. Functions get `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for free.

Reminders and the notes digest run the same way, since nothing can run in the background on a static site: `supabase/functions/reminder-cron` is called every 15 minutes by Supabase's `pg_cron`/`pg_net` (setup SQL is in `schema.sql`, commented out). Three phases: (1) each supplement/habit's `reminder_time` vs the user's local time → a push if passed and not logged today; (2) `personal_tasks`/`household_tasks` (`due_at`, skipping archived) and `personal_items`/`household_items` (`expires_on` minus `remind_days_before`) → push + email for anything due; (3) after 09:00 Europe/Warsaw, one "you have N unread notes from …" email + push per linked user, once a day (`notes_digest_state`). See the Notes/Reminders paragraphs under Architecture for the idempotency details.

## Notes for maintainers

- **Colors/branding**: CSS variables in `src/app/globals.css` (`--brand-*` is the true palette; everything else is a deepened, more legible version for text/charts). Light theme only, one typeface (Inter). `public/icons/` are PNG renders of `public/logo-mark.svg` — regenerate from the SVG if the mark changes, don't hand-edit the PNGs.

  ![Lauva brand palette](docs/palette.svg)
- **My Drive** uses [Google Identity Services' token client](https://developers.google.com/identity/oauth2/web/guides/use-token-model) (no backend, so no client secret) — the token is `drive.metadata.readonly`, lives in memory only, and never touches your Lauva/Supabase account. Signing out of Lauva also disconnects Drive, so a shared device never carries a Drive session over to whoever signs in next. To develop against it, create a Google Cloud OAuth client (Web application type), authorize `http://localhost:3000`, and enable the Drive API on that project.
- **Not in git**: `.next/`, `out/` (build output), `data/` (local raw export, never read by the app), `.claude/` (local editor/tooling scratch). See `.gitignore`.
- **Notes digest sender name**: the digest says "N unread notes from *X*", where *X* is a `display_name` from the partner's Supabase auth metadata if set (Dashboard → Authentication → Users → the user → User Metadata), otherwise a name derived from their email. `NOTES_FROM` / `REMINDERS_FROM` must be an address on a Resend-verified domain (see Deployment).
- **Connect assumes exactly one partner per account, and Home inherits that limit** — `redeem_partner_invite` rejects a redemption if either side is already linked to someone, and Home's sharing (`is_household_member`) is defined directly in terms of the same `partner_links` row. Unlinking (delete your own `partner_links` row) is supported so a mistaken pairing isn't permanent, but there's no "multiple partners" or "family" concept anywhere in the app, by design.

## License

All rights reserved — see [LICENSE](LICENSE). Source-visible for reference, not for reuse.
