# Lauva

A personal food, symptom, supplement, habit, and workout tracker, with a dashboard for making sense of it afterwards. Live at [lauva.pl](https://lauva.pl).

## How it works

Static Next.js site — no server, everything runs in the browser. Supabase is the only source of truth; IndexedDB is just a synced local cache, repopulated from Supabase on sign-in and revalidated whenever a page loads or the tab regains focus — no page fetches its own copy or needs a manual refresh to stay current.

It's also an installable PWA — `public/manifest.webmanifest` and a small service worker (`public/sw.js`, registered from `src/components/RegisterServiceWorker.tsx`) let a browser add it to the home screen and reload the app shell without a network connection. That's on top of, not instead of, the IndexedDB caching above: the service worker caches the shell (HTML/JS/CSS), IndexedDB caches the data.

Signing in is handled globally, not per page: one account menu in the nav (`src/components/auth/`), one "you're not synced" banner shown app-wide while signed out. No page grows its own login form.

Logging is tap-to-log — pick a category, tap the item, done, no forms. Food supports multi-tapping (count goes up each time, once per meal) and a meal tag. An "item" is anything you track (a food, a symptom, a habit, a supplement), with a category chosen once at creation and stored on the item itself rather than re-derived later; `src/taxonomy/classify.ts`'s `lookupFoodCategory` just guesses food's category from its typed name as a one-time prefill convenience, gated to categories that actually still exist so it can't resurrect one you removed. `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset most dashboard pages read from.

Adding, renaming, or archiving an item — and adding/removing the categories themselves — never means opening Supabase by hand. The Manage page (`src/app/manage/`) does all of it, backed by a table per type (`food_items`, `supplement_items`, `habit_items`, `symptom_items`) plus a shared `categories` table, and synced the same way as everything else. Sections are collapsed by default, alphabetized, and searchable across all four types at once. Archiving hides an item from the Log page's tap grid and its own section's active list; its full logged history still counts in every dashboard. Category lists work identically for all four types, Food included: a type with no categories yet in `categories` gets seeded from the built-in defaults in `src/taxonomy/categories.ts` the first time it's touched, and from then on the database is the only source of truth — those defaults are never reintroduced or merged back in, so removing one sticks. Deliberately the only place to hide something — the Log page just links to it rather than growing a second, competing hide mechanism.

Workout doesn't fit that shape — a lift is an exercise + a weight, with no separate "item" to classify — so it has its own table (`gym_logs`) and its own aggregation module (`src/lib/aggregations/gym.ts`), and it's the one page with an actual entry form instead of tap-to-log chips.

Dashboards: Overview, Food, Supplements, Habits, Digestion, Patterns, Workout. Most are purely descriptive — charts and stats, nothing that diagnoses anything. Food is the exception: on top of the charts, it reads your logged intake against general dietary-guidance consensus (never individual studies, never shown as reading material) to surface your overall dietary pattern — what's strong, what needs more variety, what's underrepresented — still never a diagnosis, and careful to say "not logged" rather than "not eaten." Every dashboard (Workout included) shares the same date-range filter panel — 7/30/90 days, 6 months, 1 year, or all time — placed right where it actually takes effect; a section that intentionally reads your full history regardless of that filter (Food's dietary pattern, Workout's lifetime progression) says so in its own subtitle rather than leaving it ambiguous.

Digestion and Workout are built around one question each rather than a wall of charts: Digestion's Bristol score is a single chronological line with the 3–4 target range shaded in, plus how much of the time you're actually in it; Workout leads with training consistency (sessions/month, gaps) and per-lift progression rather than a raw log table. Every page carries a small disclaimer in the footer — this is personal data description, not medical advice.

## Running it locally

```bash
npm install
npm run dev
```

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor to create the tables and row-level security policies, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the account menu in the nav.

`npm run lint`, `npm run typecheck`, and `npm run build` are what `.github/workflows/check.yml` runs on every push and PR — worth running locally before pushing so CI isn't the first place a type error or lint failure shows up.

## Going live

Push to `main` and `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages, which serves it at the custom domain in `public/CNAME` (currently lauva.pl). No separate deploy step — a merge to `main` *is* the deploy.

The "Report a bug" button in the nav emails a report through a Supabase Edge Function (`supabase/functions/report-bug`) rather than a Next.js API route, since the site itself is static with no server. `.github/workflows/deploy-functions.yml` deploys every function under `supabase/functions/` and syncs their secrets whenever that folder changes, using `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` to authenticate the Supabase CLI, plus whatever secrets each function needs (see below). Those secrets stay server-side — they're pushed into Supabase's own Edge Function secret store, never into the site build, so the client never sees them.

The breakfast reminder (a toggle on the Log page) works the same way, for the same reason: nothing can run in the background on a static site, so `supabase/functions/breakfast-reminder-cron` does the actual work, and Supabase's `pg_cron` + `pg_net` extensions call it every 15 minutes (setup SQL is in `supabase/schema.sql`, right after the table definitions — a self-hoster runs it once, filling in their own project ref and anon key). For each signed-in user with the reminder on, it checks whether their local time just entered the reminder window (10:30–10:45, so a bit before the 11:00 cutoff) and whether they've already logged breakfast that day, and sends a Web Push notification through the browser's own push service if not — which is also why it can show up even when Lauva isn't open. Enabling it stores the browser's push subscription plus IANA timezone in a new `push_subscriptions` table (one row per user; enabling on a second device just overwrites it — good enough for a personal tracker, not meant to fan out to a whole household). `RESEND_API_KEY` and `BUG_EMAIL` are for the bug-report function, not this one — the reminder needs its own two secrets: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time, public by design — it's the *public* half of a [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) VAPID keypair) and `VAPID_PRIVATE_KEY` (Supabase secret only, never built into the site). Generate a keypair with `npx web-push generate-vapid-keys`.

## Look & feel

Colors and the leaf/wave/dot mark live as CSS variables in `src/app/globals.css` (`--brand-*` for the true palette, everything else deepened for legibility) and `public/logo-mark.svg` / `src/components/Logo.tsx`. Light theme only, one typeface (Inter), no serif or display font — change a token there and it's consistent everywhere. `public/icons/` holds PNG renders of the same mark for the home-screen icon (plain and maskable, at the sizes `manifest.webmanifest` asks for) — regenerate them from the SVG rather than editing the PNGs directly if the mark ever changes.

## On disk, not in git

`.next/` and `out/` are build output, `data/` is your local raw export, `tsconfig.tsbuildinfo` and `.DS_Store` are tool/OS noise — all gitignored, so `git status` only ever shows real changes.

## License

All rights reserved — see [LICENSE](LICENSE). This is up for reference, not for reuse.
