# Lauva

A personal food, symptom, supplement, and habit tracker, with a dashboard for making sense of it all afterwards. Live at [lauva.pl](https://lauva.pl).

Logging is tap-to-log — pick a category, tap the item, done, no forms. Food supports multi-tapping (count goes up each time) and a meal tag. Everything you log shows up across the dashboard pages: Overview, Food, Supplements, Habits, Digestion, Patterns. Most of those are purely descriptive — charts and stats, nothing that diagnoses anything. Food is the exception: on top of the charts, it reads your logged intake against general dietary-guidance consensus (never individual studies, never shown as reading material) to surface a short list of food groups worth prioritizing, what's going well, and what's missing — still never a diagnosis, and careful to say "not logged" rather than "not eaten."

## Running it locally

```bash
npm install
npm run dev
```

Opens at localhost:3000 — this is just your own machine for development, separate from the live site. Nothing here talks to lauva.pl.

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the Log page. The setup SQL for the tables isn't kept in this repo — ask for it directly if you're setting up a new project.

## Going live

Push to `main` and `.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages, which serves it at the custom domain in `public/CNAME` (currently lauva.pl). No separate deploy step — a merge to `main` *is* the deploy.

## How it's put together

Static Next.js site — no server, everything runs in the browser, the only network calls go to Supabase.

An "item" is anything you track (a food, a symptom, a habit). A "log" is one entry of an item on a given day. `src/taxonomy/` classifies raw item names into categories; `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset the dashboards read from.

A few things you'll see on disk that aren't part of the repo (all gitignored): `.next/` and `out/` are build output, `data/` is your local raw export, `tsconfig.tsbuildinfo` and `.DS_Store` are tool/OS noise. None of it is tracked or deployed — `git status` will only ever show real changes.

## Look & feel

Colors and the leaf/wave/dot mark live as CSS variables in `src/app/globals.css` (`--brand-*` for the true palette, everything else deepened for legibility) and `public/logo-mark.svg` / `src/components/Logo.tsx`. Light theme only, one typeface (Inter), no serif or display font — change a token there and it's consistent everywhere.

## License

All rights reserved — see [LICENSE](LICENSE). This is up for reference, not for reuse.
