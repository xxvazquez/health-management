# Health Analytics

Personal food, symptom, supplement, and habit tracker, with a dashboard for looking at the data afterwards.

The Log page is tap-to-log — pick a category, tap the item, done, no forms. Food supports multi-tapping (count goes up each time) and a meal tag. Everything you log shows up across the other pages: Overview, Food, Supplements, Habits, Digestion, Patterns. Those are descriptive only — charts and stats, nothing that diagnoses anything.

## Running it

```bash
npm install
npm run dev
```

Opens at localhost:3000.

Logging works fully offline out of the box — everything's cached in the browser (IndexedDB). To sync across devices, set up a free Supabase project, copy `.env.local.example` to `.env.local`, fill in the URL and anon key, then sign in from the Log page. The setup SQL for the tables isn't kept in this repo — ask for it directly if you're setting up a new project.

## How it's put together

Static Next.js site, deployed to GitHub Pages (`.github/workflows/deploy.yml` builds on push to `main`). No server — everything runs in the browser, the only network calls go to Supabase.

An "item" is anything you track (a food, a symptom, a habit). A "log" is one entry of an item on a given day. `src/taxonomy/` classifies raw item names into categories; `src/lib/canonical/buildCanonicalEvents.ts` turns items + logs into the dataset the dashboards read from.
