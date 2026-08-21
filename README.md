# Lauva

A personal food, symptom, supplement, habit, and workout tracker, with a dashboard for making sense of it afterwards. Live at [lauva.pl](https://lauva.pl).

## How it works

Static Next.js site — no server, everything runs in the browser. Supabase is the only source of truth; IndexedDB is a synced local cache, repopulated from Supabase on sign-in and revalidated whenever a page loads or the tab regains focus — no page fetches its own copy or needs a manual refresh to stay current.

Every tap writes to IndexedDB first, so the UI never waits on the network, and queues itself in a small outbox alongside the write. A background drain sends queued writes to Supabase with retry and backoff, runs on reconnect and periodically, and survives closing the tab or losing connection entirely — nothing typed offline gets lost, it just sends once you're back. A write that fails permanently (not a network blip, an actual rejection) stops retrying and shows up as a small banner instead of failing silently. That same drain also runs right before a cloud sync wipes and rebuilds the local cache, and the two are coordinated through one lock so a sync can never run in the middle of a write or erase one that hasn't made it to Supabase yet.

It's also an installable PWA — `public/manifest.webmanifest` and a small service worker (`public/sw.js`, registered from `src/components/RegisterServiceWorker.tsx`) let a browser add it to the home screen and reload the app shell without a network connection. That's on top of, not instead of, the IndexedDB caching above: the service worker caches the shell (HTML/JS/CSS), IndexedDB caches the data. The cache name bakes in the deploy's git SHA (substituted by `.github/workflows/deploy.yml` right before the build, from a placeholder in `sw.js`), so every deploy is a genuinely new cache the browser detects and swaps to, instead of silently accumulating every build's assets forever.

Signing in is handled globally, not per page: one account menu in the nav (`src/components/auth/`), one "you're not synced" banner shown app-wide while signed out. No page grows its own login form.

Logging is tap-to-log — pick a category, tap the item, done, no forms. Every tab (Food, Supplements, Habits, Symptoms) has a Time field above the grid, defaulting to now — set it before tapping to log something at 9pm that actually happened at 10am, without having to go fix it up afterward. Stool has the same field built into its own form, for the same reason. Food additionally supports multi-tapping (count goes up each time, once per meal) and a meal tag. An "item" is anything you track (a food, a symptom, a habit, a supplement), with a category chosen once at creation and stored on the item itself rather than re-derived later; `src/taxonomy/classify.ts`'s `lookupFoodCategory` just guesses food's category from its typed name as a one-time prefill convenience, gated to categories that actually still exist so it can't resurrect one you removed. `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset most dashboard pages read from.

Adding, renaming, or archiving an item — and adding/removing the categories themselves — never means opening Supabase by hand. The Manage page (`src/app/manage/`) does all of it, backed by a table per type (`food_items`, `supplement_items`, `habit_items`, `symptom_items`) plus a shared `categories` table, and synced the same way as everything else. Sections are collapsed by default, alphabetized, and searchable across all four types at once. Archiving hides an item from the Log page's tap grid and its own section's active list; its full logged history still counts in every dashboard. Category lists work identically for all four types, Food included: a type with no categories yet in `categories` gets seeded from the built-in defaults in `src/taxonomy/categories.ts` the first time it's touched, and from then on the database is the only source of truth — those defaults are never reintroduced or merged back in, so removing one sticks. Deliberately the only place to hide something — the Log page just links to it rather than growing a second, competing hide mechanism.

The full shape, one table per tracked type plus the ones that don't fit it (Stool has no item to classify, one row is one bowel movement; Workout has no item either, one row is one lift; a push subscription is one row per user, not per anything trackable):

```mermaid
erDiagram
    CATEGORIES ||--o{ FOOD_ITEMS : "(user_id, category_id, item_type)"
    CATEGORIES ||--o{ SUPPLEMENT_ITEMS : "(user_id, category_id, item_type)"
    CATEGORIES ||--o{ HABIT_ITEMS : "(user_id, category_id, item_type)"
    CATEGORIES ||--o{ SYMPTOM_ITEMS : "(user_id, category_id, item_type)"

    FOOD_ITEMS ||--o{ FOOD_LOGS : "(user_id, item_id)"
    FOOD_ITEMS ||--o{ FOOD_DIARY : "(user_id, item_id)"
    SUPPLEMENT_ITEMS ||--o{ SUPPLEMENT_LOGS : "(user_id, item_id)"
    SUPPLEMENT_ITEMS ||--o{ SUPPLEMENT_DIARY : "(user_id, item_id)"
    HABIT_ITEMS ||--o{ HABIT_LOGS : "(user_id, item_id)"
    HABIT_ITEMS ||--o{ HABIT_DIARY : "(user_id, item_id)"
    SYMPTOM_ITEMS ||--o{ SYMPTOM_LOGS : "(user_id, item_id)"
    SYMPTOM_ITEMS ||--o{ SYMPTOM_DIARY : "(user_id, item_id)"

    CATEGORIES {
        uuid id PK
        uuid user_id
        text item_type
        text name
    }
    FOOD_ITEMS {
        uuid id PK
        uuid user_id
        text name
        uuid category_id FK
        boolean is_archived
    }
    SUPPLEMENT_ITEMS {
        uuid id PK
        uuid user_id
        text name
        uuid category_id FK
        boolean is_archived
        time reminder_time
        date reminder_last_sent_date
    }
    HABIT_ITEMS {
        uuid id PK
        uuid user_id
        text name
        uuid category_id FK
        boolean is_archived
        time reminder_time
        date reminder_last_sent_date
    }
    SYMPTOM_ITEMS {
        uuid id PK
        uuid user_id
        text name
        uuid category_id FK
        boolean is_archived
    }
    FOOD_LOGS {
        uuid id PK
        uuid item_id FK
        date date
        numeric value
        text meal_tag
    }
    SUPPLEMENT_LOGS {
        uuid id PK
        uuid item_id FK
        date date
        numeric value
    }
    HABIT_LOGS {
        uuid id PK
        uuid item_id FK
        date date
        numeric value
    }
    SYMPTOM_LOGS {
        uuid id PK
        uuid item_id FK
        date date
        numeric value
    }
    FOOD_DIARY {
        uuid id PK
        uuid item_id FK
        date date
        text content
    }
    SUPPLEMENT_DIARY {
        uuid id PK
        uuid item_id FK
        date date
        text content
    }
    HABIT_DIARY {
        uuid id PK
        uuid item_id FK
        date date
        text content
    }
    SYMPTOM_DIARY {
        uuid id PK
        uuid item_id FK
        date date
        text content
    }
    STOOL_LOGS {
        uuid id PK
        uuid user_id
        date date
        smallint_array bristol_scores
        text floatation
        text color
        text paper_cleanliness
        smallint time_on_toilet_minutes
    }
    GYM_LOGS {
        uuid user_id PK
        uuid id PK
        date date
        text exercise
        numeric weight_kg
    }
    PUSH_SUBSCRIPTIONS {
        uuid user_id PK
        text endpoint
        text timezone
    }
```

`STOOL_LOGS`, `GYM_LOGS`, and `PUSH_SUBSCRIPTIONS` have no relationships drawn — deliberately: none of them has an item to classify, so none references `CATEGORIES` or anything else. Every relationship above is a composite foreign key, not a plain one — `(user_id, category_id, item_type)` means a supplement item structurally can't reference a habit category, and `(user_id, item_id)` means no row can ever reference another user's data, regardless of RLS. Every item is `on delete restrict` — one with any history can be archived but never deleted, so a log can't outlive the thing it's about. See [`supabase/schema.sql`](supabase/schema.sql) for the actual DDL.

Workout doesn't fit that shape — a lift is an exercise + a weight, with no separate "item" to classify — so it has its own table (`gym_logs`) and its own aggregation module (`src/lib/aggregations/gym.ts`), and it's the one page with an actual entry form instead of tap-to-log chips.

Dashboards: Overview, Food, Supplements, Habits, Digestion, Patterns, Workout — all still fully working, but only Log, Workout, Food, and Manage items are currently linked in the nav (`src/components/Nav.tsx`) while analytics gets rebuilt one area at a time; the rest are one edit away from being re-added, nothing about them was removed. Most are purely descriptive — charts and stats, nothing that diagnoses anything. Food is the exception: on top of the charts, it reads your logged intake against a research-informed scoring model (`src/lib/aggregations/nutritionPriorities.ts`) to surface what's underrepresented and a "Focus next week" list of concrete suggestions, with a one-line "N ingredients · N groups underrepresented · variety stable/increasing/decreasing" summary rather than a large pattern card. Repetition of a food is never itself treated as a problem — a well-covered, evidence-backed group logged often is explicitly excluded from every recommendation; only an actual gap, or a food dominating intake while other core food groups are missing, gets surfaced. Food Analytics itself stays deliberately citation-free — no PubMed IDs, DOIs, or "why this is suggested" links in the page; the underlying research (systematic reviews, meta-analyses, cohort studies — real PubMed IDs/DOIs, `src/lib/nutritionEvidenceRecords.ts`) lives entirely on its own page at Manage → Nutrition evidence (`src/app/manage/nutrition-evidence/`), reusing the same evidence records rather than a second system. Still never a diagnosis, and careful to say "not logged" rather than "not eaten" — logging frequency, never a stand-in for quantity or what was actually eaten. Every dashboard (Workout included) shares the same date-range filter panel component — Food uses its own preset wording (this week / 2 weeks / 1 month / 6 months / 1 year / all time, plus a custom range) since "this week" reads more naturally there than the "last N days" phrasing every other page keeps — placed right where it actually takes effect; a section that intentionally reads your full history regardless of that filter (Food's underrepresented-foods/Focus-next-week cards, Workout's lifetime progression) says so in its own subtitle rather than leaving it ambiguous.

Digestion and Workout are built around one question each rather than a wall of charts: Digestion's Bristol score is a single chronological line with the 3–4 target range shaded in, plus how much of the time you're actually in it; Workout leads with training consistency (sessions/month, gaps) and per-lift progression rather than a raw log table. Every page carries a small disclaimer in the footer — this is personal data description, not medical advice.

## Running it locally

Needs Node 24 (see `.nvmrc`).

```bash
npm install
npm run dev
```

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor to create the tables and row-level security policies, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the account menu in the nav.

`npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` are what `.github/workflows/check.yml` runs on every push and PR — worth running locally before pushing so CI isn't the first place a type error, lint failure, or broken test shows up. A separate `rls` job in that same workflow applies the schema to a throwaway Postgres container and runs [`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql) against it — a security test suite checking that row-level security actually stops one user from reading, writing, or referencing another's data, for every table.

## Going live

Push to `main` and `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages, which serves it at the custom domain in `public/CNAME` (currently lauva.pl). No separate deploy step — a merge to `main` *is* the deploy.

The "Report a bug" button in the nav emails a report through a Supabase Edge Function (`supabase/functions/report-bug`) rather than a Next.js API route, since the site itself is static with no server. `.github/workflows/deploy-functions.yml` deploys every function under `supabase/functions/` and syncs their secrets whenever that folder changes, using `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` to authenticate the Supabase CLI, plus whatever secrets each function needs (see below). Those secrets stay server-side — they're pushed into Supabase's own Edge Function secret store, never into the site build, so the client never sees them. One gotcha: changing a secret's *value* in GitHub doesn't trigger this workflow — there's no event for that — so after adding or rotating one, run it manually from the Actions tab (it already has `workflow_dispatch` enabled) or the function keeps running with whatever it last had.

Reminders work the same way, for the same reason: nothing can run in the background on a static site, so `supabase/functions/breakfast-reminder-cron` does the actual work, and Supabase's `pg_cron` + `pg_net` extensions call it every 15 minutes (setup SQL is in `supabase/schema.sql`, right after the table definitions — a self-hoster runs it once, filling in their own project ref and anon key). The function's still named after the single fixed breakfast check it started as, but it's now general: any supplement or habit can carry its own `reminder_time` (set from the Manage Items page, next to that item), and each run checks every one of those against the signed-in user's local time, sending a Web Push notification once an item's time has passed for the day and it isn't logged yet — which is also why it can show up even when Lauva isn't open. "Turn on notifications" (also on the Manage page) is the separate on/off switch for whether this device receives anything at all — it stores the browser's push subscription plus IANA timezone in `push_subscriptions` (one row per user; enabling on a second device just overwrites it — good enough for a personal tracker, not meant to fan out to a whole household). `RESEND_API_KEY` and `BUG_EMAIL` are for the bug-report function, not this one — reminders need their own two secrets: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time, public by design — it's the *public* half of a [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) VAPID keypair) and `VAPID_PRIVATE_KEY` (Supabase secret only, never built into the site). Generate a keypair with `npx web-push generate-vapid-keys`.

## Look & feel

Colors and the leaf/wave/dot mark live as CSS variables in `src/app/globals.css` (`--brand-*` for the true palette, everything else deepened for legibility) and `public/logo-mark.svg` / `src/components/Logo.tsx`. Light theme only, one typeface (Inter), no serif or display font — change a token there and it's consistent everywhere. `public/icons/` holds PNG renders of the same mark for the home-screen icon (plain and maskable, at the sizes `manifest.webmanifest` asks for) — regenerate them from the SVG rather than editing the PNGs directly if the mark ever changes.

## On disk, not in git

`.next/` and `out/` are build output, `data/` is your local raw export, `tsconfig.tsbuildinfo` and `.DS_Store` are tool/OS noise — all gitignored, so `git status` only ever shows real changes.

## License

All rights reserved — see [LICENSE](LICENSE). This is up for reference, not for reuse.
