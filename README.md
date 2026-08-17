# Lauva

A personal food, symptom, supplement, habit, and gym tracker, with a dashboard for making sense of it afterwards. Live at [lauva.pl](https://lauva.pl).

## How it works

Static Next.js site — no server, everything runs in the browser. Supabase is the only source of truth; IndexedDB is just a synced local cache, repopulated from Supabase on sign-in.

Logging is tap-to-log — pick a category, tap the item, done, no forms. Food supports multi-tapping (count goes up each time) and a meal tag. An "item" is anything you track (a food, a symptom, a habit, a supplement); a "log" is one entry of an item on a given day. `src/taxonomy/` classifies raw item names into categories, and `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset most dashboard pages read from.

Gym doesn't fit that shape — a lift is an exercise + a weight, with no separate "item" to classify — so it has its own table (`gym_logs`) and its own aggregation module (`src/lib/aggregations/gym.ts`), and it's the one page with an actual entry form instead of tap-to-log chips.

Dashboards: Overview, Food, Supplements, Habits, Digestion, Patterns, Gym. Most are purely descriptive — charts and stats, nothing that diagnoses anything. Food is the exception: on top of the charts, it reads your logged intake against general dietary-guidance consensus (never individual studies, never shown as reading material) to surface a short list of food groups worth prioritizing, what's going well, and what's missing — still never a diagnosis, and careful to say "not logged" rather than "not eaten."

## Running it locally

```bash
npm install
npm run dev
```

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor to create the tables and row-level security policies, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the Log page.

## Going live

Push to `main` and `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages, which serves it at the custom domain in `public/CNAME` (currently lauva.pl). No separate deploy step — a merge to `main` *is* the deploy.

## Look & feel

Colors and the leaf/wave/dot mark live as CSS variables in `src/app/globals.css` (`--brand-*` for the true palette, everything else deepened for legibility) and `public/logo-mark.svg` / `src/components/Logo.tsx`. Light theme only, one typeface (Inter), no serif or display font — change a token there and it's consistent everywhere.

## On disk, not in git

`.next/` and `out/` are build output, `data/` is your local raw export, `tsconfig.tsbuildinfo` and `.DS_Store` are tool/OS noise — all gitignored, so `git status` only ever shows real changes.

## License

All rights reserved — see [LICENSE](LICENSE). This is up for reference, not for reuse.
