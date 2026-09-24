# Architecture

How Lauva stores, syncs and sends data. For the schema itself see [data-model.md](data-model.md).

- [Sync and the local cache](#sync-and-the-local-cache)
- [Data shapes](#data-shapes)
- [Direct-to-Supabase features](#direct-to-supabase-features)
- [PWA shell](#pwa-shell)
- [Background jobs](#background-jobs)
- [Email](#email)
- [Google Drive](#google-drive)
- [Deployment details](#deployment-details)

---

## Sync and the local cache

**Supabase is the source of truth. IndexedDB is a cache.**

### Reading

- IndexedDB is refreshed from Supabase on sign-in, tab focus, reconnect, and every 60 s while the tab is visible.
- Writes still waiting in the outbox are replayed on top of each fresh copy (`replayUnsyncedWrites`), so they never disappear from the screen.
- Every pull filters `.eq("user_id", …)` explicitly rather than trusting RLS alone.

### Writing

- Every write goes to IndexedDB first, so the UI never waits on the network.
- It's then queued in the **outbox**, which drains to Supabase oldest-first with retry and backoff. A drain starts about a second after anything is queued (`setOutboxEnqueueListener`, wired in `DataContext`), as well as on every full sync.
- Sends time out after 30 s (`withSendTimeout` in `outbox.ts`) and are retried rather than left hanging.
- One write lock (`withDataLock` in `indexedDb.ts`) stops a pull from landing in the middle of a local write.

### When things go wrong

| Problem | What the user sees |
|---|---|
| Writes waiting to sync | `SyncStatusBanner`: pending count, Retry now, a per-item list, and "Save a copy as a file" |
| A write the server rejects | The record, the reason, and Retry / Discard |
| Refused login token (`PGRST301`–`303`) | Nothing. The drain refreshes the session once and resends |
| IndexedDB rejects a save (out of space, blocked) | `StorageErrorBanner` warns that the last change may not be kept |

### Checks on read

- A server row missing its id, date or name is skipped during a pull, never half-installed (`REQUIRED_COLUMNS` in `sync.ts`).
- An outbox entry with no usable payload is dead-lettered instead of sent (`isSendableOutboxEntry`).
- A snapshot that doesn't match its envelope is dropped and refetched (`readSnapshot`).

### Export

Settings → "Your data" exports straight from Supabase (`src/lib/exportData.ts`):

- **JSON:** the whole account in one file
- **CSV:** one section or everything. One table → a `.csv`; several → a `.zip`
- Signed-in only; partner messages and sharing/push plumbing are left out
- `exportData.test.ts` fails if a table in `schema.sql` is neither exported nor on its short skip list, so a new table can't be forgotten

---

## Data shapes

### Items, logs, diary, categories

Used by Food, Supplements, Habits, Symptoms and Workout.

- An **item** (what you track) has a category and many **logs**, one per occurrence
- An optional **diary** entry per day
- Built-in categories from `taxonomy/categories.ts` apply until a user creates a real category row
- A category can have a custom icon and colour (`categories.icon` / `color`), used on the Log page
- **Archive** hides an item but keeps its history. **Delete** is only allowed with zero history (FKs are `on delete restrict`)

### Domains with their own tables

| Domain | Tables | Notes |
|---|---|---|
| Stool | `stool_logs`, `stool_options` | Option chips are user-editable; logged values are plain text, so hiding a chip never rewrites history |
| Workout | `workout_items`, `workout_logs`, `workout_plans` | App code uses exercise names; `item_id` is resolved only at the sync boundary. Plans are direct-to-Supabase (`useWorkoutPlans`); weekly targets are derived, never stored |
| Cycle | `period_logs` | One row per period day. Length, cycle day and predictions come from `aggregations/cycle.ts` |
| Coffee | `coffee_items`, `coffee_logs`, `coffee_options`, `coffee_settings` | Catalog + one row per cup; editable chips like Stool; currency is a per-user setting |

### Ownership rules

- Every FK between user-owned tables is a **composite `(user_id, id)`** (plus `item_type` for categories), so a row can't point at another user's data, whatever the RLS says.
- `supabase/schema.sql` is authoritative.

---

## Direct-to-Supabase features

Messages, Agenda, Health, Journal, Wishlist, Codes, Vitals and Coffee talk to Supabase directly instead of mirroring everything in IndexedDB. **They still work offline.**

### Offline reads: snapshots

- Each hook caches its shaped result in the `snapshots` store (`useSnapshotCache.ts`), keyed `${userId}:${feature}`
- On mount it renders the snapshot instantly, then refetches
- Each snapshot write carries its fetch time, so a slow fetch can't overwrite a newer one
- `cloudRefresh.ts` refetches on the same triggers as a normal pull
- A fetch is never applied while the outbox still holds a write for that feature, so an offline delete can't be undone by stale server data

### Offline writes: `directWrite.ts`

Each write tries Supabase first, and falls back to the shared outbox if the network fails. Ids are generated client-side, so the optimistic row and the synced row are the same record.

| Function | Use for |
|---|---|
| `upsertDirect` | A create, or an edit of an owner-only row |
| `updateDirect` | An edit of a partner-visible row (`household_*`, `wishlist_*`) — needed for the split RLS policies |
| `insertDirect` | Write-once rows (`care_entry_specialties`, `*_task_completions`), `ON CONFLICT DO NOTHING` |
| `deleteDirect` / `deleteWhereDirect` | Delete by id, or by column match for rows with no id |

Parent-and-child writes (an appointment with tasks, a whole blood draw) queue parent first; the outbox drains in order, so the FK holds.

### Feature notes

- **Messages** (`notes`)
  - Two accounts link by redeeming an invite code (`redeem_partner_invite`), creating a `partner_links` row
  - A reply is a `notes` row with `thread_root_id`; a trigger keeps `last_message_at` and read state current
  - Read state and archive are per side; favourite is shared
- **Personal vs household**
  - `personal_*` tables are owner-only
  - `household_*` tables are visible to the creator and their linked partner (`is_household_member()`)
  - "Shared" means "which table the row is in" — there's no `is_shared` column
- **Reminders and expiry** (`*_tasks`, `*_items`) show together on Agenda
  - A task is one-off (`recurrence_days` null) or recurring (`due_at` advances on completion)
  - Each completion writes a `*_task_completions` row; Undo drops the latest one
  - A reminder can carry a checklist (`*_task_subitems`)
  - `reminder_sent_at` is the only guard against duplicate notifications
- **Reminder lists** (`reminder_lists`): deleting a list moves its tasks to the default bucket (`on delete set null`)
- **Codes** (`household_codes`): a code past its `expires_on` is deleted client-side the next time the list opens
- **Wishlist** (`wishlist_categories`, `wishlist_items`)
  - Link titles come from the `fetch-link-metadata` Edge Function (the browser can't, because of CORS)
  - Android shares straight in via the PWA `share_target` (`/personal/?url=…`)
  - iOS uses a Shortcut that posts to the `wishlist-share` function with a per-account token
- **Health** (`doctor_*`, `care_entries`, `lab_*`)
  - The route is `/medical`, but the code and tables keep the `doctor_` name
  - An appointment freezes a copy of the doctor's specialty, so later edits never rewrite history
  - The next-appointment date lives on `doctor_specialties`
  - Care entries are observations, notes or decisions, tagged to specialties. They can carry a `remind_on` date, and a decision can link a supplement
  - Care entries can link Google Drive files (`care_entry_files`), as pointers, never copies
- **Icons and colours:** one shared picker (`IconColorPicker.tsx`, `customIcons.tsx`) for categories, wishlist lists, reminder lists, specialties and lab panels — Lauva's own glyphs plus the full Lucide set (`lucide-react`; the grid loads it in one chunk only when a picker opens, a saved icon loads per icon), and brand hues plus any custom colour
- **Voice input** on Expiration and Codes uses the browser's Web Speech API

---

## PWA shell

- `public/manifest.webmanifest` + `public/sw.js` cache the app shell separately from the data cache
- The service worker cache name includes the deploy's git SHA, so each deploy gets a fresh cache
- Pinch-zoom and rubber-band scrolling are off, so the installed app holds still
- `PullToRefresh.tsx` syncs with Supabase when you pull down from the top

---

## Background jobs

A static site can't run anything in the background, so Supabase's `pg_cron` / `pg_net` calls `reminder-cron` every 15 minutes with a 150s request timeout (setup SQL is commented out in `schema.sql`).

| Phase | Sends |
|---|---|
| 1. Habit and supplement reminders | A push when an item's `reminder_time` has passed and it isn't logged today. Also `habit_reminders` per tracked section |
| 2. Due things | Push + email for due tasks, expiring items, follow-up tasks past `reminder_at`, and care entries on their `remind_on` date |
| 3. Message digest | After 09:00 Warsaw time, one "N unread messages" email + push per user, at most once a day |

- **Instant message push:** sending a message calls `notify-note`, which pushes "*X* sent you a message", with no content in the payload
- **Push to every device:** `push_subscriptions` is keyed on `(user_id, endpoint)`, so each of a user's devices gets the push. Never a partner's devices
- **Cleanup:** a second cron job trims `cron.job_run_details` to 7 days
- **Digest sender name:** the partner's `display_name` from Supabase auth metadata, else a name made from their email

---

## Email

- Needs a **verified Resend domain**. The shared `onboarding@resend.dev` sender only delivers to the Resend account owner
- `NOTES_FROM` / `REMINDERS_FROM` must be on exactly the verified domain: `send.lauva.pl`, e.g. `Lauva <reminders@send.lauva.pl>`. The parent `lauva.pl` is rejected
- Bug reports go to `BUG_EMAIL` (the account owner), so they work either way

---

## Google Drive

- Uses Google Identity Services' token client: no backend, no client secret
- Scopes: `drive.metadata.readonly` (browse) and `drive.file` (upload attachments into a "Lauva attachments" folder)
- The token lives in memory only; signing out of Lauva disconnects Drive
- Local setup: an OAuth **Web application** client with `http://localhost:3000` authorized, both scopes on the consent screen, and the Drive API enabled

---

## Deployment details

- **App:** `deploy.yml` builds with full git history (for the version number) and publishes to GitHub Pages
- **Edge Functions:** `deploy-functions.yml` deploys on changes to `supabase/functions/` and pushes only secrets that have a value, so an empty GitHub secret can't wipe one set by hand. Changing a secret's value alone doesn't trigger it; run it manually
- **Service key:** functions prefer `SERVICE_ROLE_JWT` (a legacy `service_role` JWT, set by hand) over the built-in `SUPABASE_SERVICE_ROLE_KEY`, whose `sb_secret_` form PostgREST rejects with `PGRST303`
- **RLS tests:** CI applies `schema.sql` to a throwaway Postgres and runs `supabase/tests/rls.test.sql`; `sync.test.ts` covers the client's own `user_id` scoping, including an account switch
