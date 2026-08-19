# Lauva

A personal food, symptom, supplement, habit, and gym tracker, with a dashboard for making sense of it afterwards. Live at [lauva.pl](https://lauva.pl).

## How it works

Static Next.js site — no server, everything runs in the browser. Supabase is the only source of truth; IndexedDB is just a synced local cache, repopulated from Supabase on sign-in and revalidated whenever a page loads or the tab regains focus — no page fetches its own copy or needs a manual refresh to stay current.

Signing in is handled globally, not per page: one account menu in the nav (`src/components/auth/`), one "you're not synced" banner shown app-wide while signed out. No page grows its own login form.

Logging is tap-to-log — pick a category, tap the item, done, no forms. Food supports multi-tapping (count goes up each time, once per meal) and a meal tag. An "item" is anything you track (a food, a symptom, a habit, a supplement); a "log" is one entry of an item on a given day. `src/taxonomy/` classifies raw item names into categories, and `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset most dashboard pages read from.

Adding, renaming, or archiving an item never means opening Supabase by hand — the Manage page (`src/app/manage/`) does it for every item type, backed by the same `items` table and synced the same way as everything else. Archiving hides an item from the Log page's tap grid and its own domain page's active list; its full logged history still counts in every dashboard. Food's category list is fixed on purpose (it's load-bearing for the nutrition-guidance engine below — renaming "Legumes" would silently break its coverage tracking), but Symptoms/Supplements/Habits categories are still a plain list in `src/taxonomy/categories.ts` today, not yet editable from the Manage page — see "Known gaps" below.

Gym doesn't fit that shape — a lift is an exercise + a weight, with no separate "item" to classify — so it has its own table (`gym_logs`) and its own aggregation module (`src/lib/aggregations/gym.ts`), and it's the one page with an actual entry form instead of tap-to-log chips.

Dashboards: Overview, Food, Supplements, Habits, Digestion, Patterns, Gym. Most are purely descriptive — charts and stats, nothing that diagnoses anything. Food is the exception: on top of the charts, it reads your logged intake against general dietary-guidance consensus (never individual studies, never shown as reading material) to surface your overall dietary pattern — what's strong, what needs more variety, what's underrepresented — still never a diagnosis, and careful to say "not logged" rather than "not eaten." Every dashboard (Gym included) shares the same date-range filter panel — 7/30/90 days, 6 months, 1 year, or all time — placed right where it actually takes effect; a section that intentionally reads your full history regardless of that filter (Food's dietary pattern, Gym's lifetime progression) says so in its own subtitle rather than leaving it ambiguous.

Digestion and Gym are built around one question each rather than a wall of charts: Digestion's Bristol score is a single chronological line with the 3–4 target range shaded in, plus how much of the time you're actually in it; Gym leads with training consistency (sessions/month, gaps) and per-lift progression rather than a raw log table. Every page carries a small disclaimer in the footer — this is personal data description, not medical advice.

### Known gaps

- Symptoms/Supplements/Habits category lists are still hardcoded in `src/taxonomy/categories.ts`, not yet user-editable from the Manage page — adding a genuinely new category for those three types still needs a code change.
- If you're upgrading from before the Manage page existed: a handful of items used to be hidden from the Log page's tap grid via a hardcoded list in code (`src/taxonomy/delistedFromLogging.ts`, since removed). That list is gone in favor of the same `isArchived` flag everything else uses — if you relied on it, re-archive those specific items once from the Manage page; nothing does it for you automatically.

## Running it locally

```bash
npm install
npm run dev
```

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor to create the tables and row-level security policies, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the account menu in the nav.

`npm run lint`, `npm run typecheck`, and `npm run build` are what `.github/workflows/check.yml` runs on every push and PR — worth running locally before pushing so CI isn't the first place a type error or lint failure shows up.

## Going live

Push to `main` and `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages, which serves it at the custom domain in `public/CNAME` (currently lauva.pl). No separate deploy step — a merge to `main` *is* the deploy.

## Look & feel

Colors and the leaf/wave/dot mark live as CSS variables in `src/app/globals.css` (`--brand-*` for the true palette, everything else deepened for legibility) and `public/logo-mark.svg` / `src/components/Logo.tsx`. Light theme only, one typeface (Inter), no serif or display font — change a token there and it's consistent everywhere.

## On disk, not in git

`.next/` and `out/` are build output, `data/` is your local raw export, `tsconfig.tsbuildinfo` and `.DS_Store` are tool/OS noise — all gitignored, so `git status` only ever shows real changes.

## License

All rights reserved — see [LICENSE](LICENSE). This is up for reference, not for reuse.
