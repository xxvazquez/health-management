# Data model

Everything Lauva stores lives in one Supabase (Postgres) project.
[`supabase/schema.sql`](../supabase/schema.sql) is the authoritative
definition — full DDL, indexes, triggers, and RLS policies. This document
is the readable map of it: what the tables are, how they group, and how
they relate.

IndexedDB in the browser is only a synced cache of a subset of these
tables (the item/log/diary core). It holds no data that isn't in Supabase.

## Conventions

Every table follows the same rules unless noted otherwise:

- **`user_id` on every table**, `not null default auth.uid()` — the app
  never passes it on insert.
- **Row-level security on every table.** The default shape is
  `using (auth.uid() = user_id) with check (auth.uid() = user_id)` — a
  user only ever sees or writes their own rows. The exceptions (Connect,
  Home) are listed in [RLS shapes](#rls-shapes) below.
- **Composite foreign keys.** Every FK between user-owned tables is on
  `(user_id, id)`, not `id` alone, so a row structurally cannot reference
  another user's row even if RLS were misconfigured. Category FKs also
  carry `item_type`, so a supplement item can't point at a habit category.
- **`name_key`** — a generated `lower(trim(name))` column, used for
  case-insensitive uniqueness per user.
- **`on delete restrict`** on every `*_logs` / `*_diary` FK — an item with
  any history can only be archived (`is_archived`), never hard-deleted.
  Notes and tasks follow the same "archive, don't delete" rule.

## Tracked-domain core (Food, Supplement, Habit, Symptom, Workout)

One `*_items` table, one `*_logs` table, and one `*_diary` table per
tracked type, all pointing into a shared `categories` table. This is the
shape the browser cache mirrors and the analytics dashboards read.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef5f3", "primaryBorderColor": "#5c8a7a",
  "primaryTextColor": "#24313a", "lineColor": "#7d9a90",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    CATEGORIES  ||--o{ ITEMS : groups
    ITEMS       ||--o{ LOGS  : "occurrences"
    ITEMS       ||--o{ DIARY : "one note per day"

    CATEGORIES {
        uuid id PK
        text item_type "food / supplement / habit / symptom / workout"
        text name
        text name_key "generated, unique per user+type"
    }
    ITEMS {
        uuid    id PK
        text    name
        uuid    category_id FK
        boolean is_archived
        time    reminder_time "supplement / habit only"
        date    reminder_last_sent_date "supplement / habit only"
        text    unit "workout only: kg / minutes / reps"
    }
    LOGS {
        uuid    id PK
        uuid    item_id FK
        date    date
        numeric value
        text    meal_tag "food / supplement only"
    }
    DIARY {
        uuid id PK
        uuid item_id FK
        date date
        text title
        text content
    }
```

`ITEMS` / `LOGS` / `DIARY` above stand for the five concrete tables each —
`food_items` … `workout_items`, `food_logs` … `symptom_logs`,
`food_diary` … `workout_diary`. They are structurally identical apart from
the type-specific columns called out in the diagram. Workout has an item
table and a diary table but its logs live in `workout_logs` (next
section), which stores a denormalised exercise name rather than only an
`item_id`.

## Standalone logs (Stool, Workout sets, Cycle)

These don't fit the item/log/diary shape — a bowel movement or a lift
isn't "an item plus an occurrence" — so each is its own flat table.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef5f3", "primaryBorderColor": "#5c8a7a",
  "primaryTextColor": "#24313a", "lineColor": "#7d9a90",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    WORKOUT_ITEMS ||--o{ WORKOUT_LOGS : "logged sets"

    STOOL_LOGS {
        uuid        id PK
        date        date
        timestamptz logged_at
        smallint    bristol_scores "array of 1-7, never empty"
        text        color "Brown / … / Black / Pale"
        text        hygiene "array: cleanliness grade(s) + method(s)"
        text        symptoms "array: movement-level symptoms"
        boolean     flags "is_sticky, is_smelly, is_straining"
        text        note
    }
    WORKOUT_LOGS {
        uuid    id PK
        uuid    item_id FK
        date    date
        numeric weight_kg "unit per workout_items.unit"
    }
    PERIOD_LOGS {
        uuid id PK
        date date "unique per user, row present = period day"
        text intensity "Light / Medium / Heavy / Super Heavy"
        text collection_methods "array"
    }
```

**Nothing about the cycle is stored** beyond the flagged period days.
Cycle length, current cycle day, period length, and next-period
predictions are all derived from `period_logs` dates at the app layer
([`src/lib/aggregations/cycle.ts`](../src/lib/aggregations/cycle.ts)),
using a recent-cycles window rather than all history.

## Connect → Notes

Private messages between two linked accounts. This is the only part of the
schema where one user's action creates or reads a row about another user,
so it leans on two `security definer` functions instead of ordinary
policies.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef1fa", "primaryBorderColor": "#4554a1",
  "primaryTextColor": "#24313a", "lineColor": "#7d8ec7",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    PARTNER_INVITES ||..o| PARTNER_LINKS : "redeem_partner_invite()"
    PARTNER_LINKS   ||--o{ NOTES         : "scopes who can message"
    NOTES           ||--o{ NOTES         : "thread_root_id replies"

    PARTNER_INVITES {
        uuid        id PK
        text        code "unique, 8 chars"
        uuid        created_by FK
        timestamptz expires_at "default now() + 7 days"
        uuid        redeemed_by FK
    }
    PARTNER_LINKS {
        uuid id PK
        uuid user_a_id FK
        uuid user_b_id FK
        text constraints "a != b, at most one link per user"
    }
    NOTES {
        uuid        id PK
        uuid        sender_id FK
        uuid        recipient_id FK
        uuid        thread_root_id FK "null = top-level note"
        text        category "note / reminder / appreciation / question"
        text        subject
        text        body
        timestamptz last_message_at "root row only"
        timestamptz sender_read_at "root row only"
        timestamptz recipient_read_at "root row only"
        boolean     per_side_flags "favourited + archived, per side, root only"
    }
```

- A **reply is just another `notes` row** with `thread_root_id` set — no
  replies table. The `last_message_at` / `*_read_at` / `*_favourited` /
  `*_archived` columns are meaningful on the root row only; the
  `notes_touch_thread` trigger keeps them current as replies arrive, which
  is what makes a thread unread again for the other side without a
  read-receipt table.
- `notes_lock_identity_columns` (BEFORE UPDATE trigger) rejects any change
  to `sender_id` / `recipient_id` / `thread_root_id` after insert.
- `partner_links` has **no INSERT/UPDATE policy** — the only way a link is
  created is `redeem_partner_invite()`. Participants can SELECT their own
  link and DELETE it (unlink).

## Log → Notes / Reminders / Expiration (private)

The three private-organiser tabs after Journal on the Log page. One user,
standard owner-only RLS, written directly to Supabase (no offline/outbox).
The `/home` page has shared (partner) versions of all three — same
components, `household_*` tables (next section).

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef5f3", "primaryBorderColor": "#5c8a7a",
  "primaryTextColor": "#24313a", "lineColor": "#7d9a90",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    PERSONAL_TASKS ||--o{ PERSONAL_TASK_COMPLETIONS : "full history"

    PERSONAL_NOTES {
        uuid id PK
        text title
        text body
    }
    PERSONAL_TASKS {
        uuid        id PK
        text        title
        text        notes
        timestamptz due_at "one-off: deadline / recurring: next occurrence"
        int         recurrence_days "null = one-off"
        timestamptz last_completed_at "denormalised latest completion"
        boolean     is_archived "retired from the active list"
        timestamptz reminder_sent_at "idempotency stamp for current due_at"
    }
    PERSONAL_TASK_COMPLETIONS {
        uuid        id PK
        uuid        task_id FK
        timestamptz completed_at
    }
    PERSONAL_ITEMS {
        uuid id PK
        text name
        date expires_on
        int  remind_days_before
        timestamptz reminder_sent_at
    }
```

`recurrence_days` null → one-off task (`last_completed_at` set = done, shown
in a "Done" section). Set → recurring: `due_at` advances by
`recurrence_days` on every completion, `reminder_sent_at` clears so the next
occurrence reminds again, and the task never becomes permanently done.
`is_archived` moves a task into an "Archived" section without deleting its
history; "Undo" drops the newest completion row (and rewinds `due_at` for a
recurring task). `personal_notes` and `personal_items` have no
relationships — a title+body note, and a name+expiry-date product.

## Doctors

A personal history log of doctor appointments already attended (not a
scheduler). One user, standard owner-only RLS, written directly to Supabase.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef5f3", "primaryBorderColor": "#5c8a7a",
  "primaryTextColor": "#24313a", "lineColor": "#7d9a90",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    DOCTORS ||--o{ DOCTOR_APPOINTMENTS : "visits"
    DOCTOR_APPOINTMENTS ||--o{ DOCTOR_APPOINTMENT_TASKS : "follow-up tasks"
    CARE_ENTRIES ||--o{ CARE_ENTRY_SPECIALTIES : "tagged to"
    DOCTOR_SPECIALTIES ||--o{ CARE_ENTRY_SPECIALTIES : "concerns"

    DOCTOR_SPECIALTIES {
        uuid id PK
        text name
        text name_key "generated, unique per user"
        date next_appointment_date "one per specialty, nullable"
        boolean is_archived "hidden from the picker, reversible"
    }
    CARE_ENTRIES {
        uuid id PK
        date happened_on
        text kind "observation | note"
        text title
        text body "nullable"
    }
    CARE_ENTRY_SPECIALTIES {
        uuid entry_id FK
        uuid specialty_id FK
    }
    DOCTORS {
        uuid id PK
        text name
        text specialty "current specialty (denormalised string)"
        smallint rating "1-3, nullable; 1 = shown in red"
        text language "Polish / English / Spanish, nullable"
    }
    DOCTOR_APPOINTMENTS {
        uuid id PK
        uuid doctor_id FK
        text specialty "frozen copy from the doctor at logging time"
        timestamptz appointment_at
        text reason
        text follow_up_notes
    }
    DOCTOR_APPOINTMENT_TASKS {
        uuid id PK
        uuid appointment_id FK
        text description
        date due_date "optional"
        timestamptz reminder_at "optional one-off push/email"
        timestamptz reminder_sent_at "cron idempotency guard"
        timestamptz completed_at "null = open"
    }
```

`doctor_specialties` is the managed picker list; a built-in default set
(`src/lib/doctors.ts`) shows until the user edits one, at which point the whole
set is materialized as rows and the rows win from then on — same rule as item
categories. Each row can be renamed, archived (`is_archived` — kept out of the
picker but reversible; a historical appointment keeps its own frozen specialty
string so nothing is lost) or deleted, all from the Manage page. The table also
holds the single next-appointment date per specialty — deliberately not on
`doctors` or `doctor_appointments`, so several doctors in one specialty still
share one "next visit" date. Each appointment copies
the doctor's specialty at logging time and never rewrites it, so specialty
history stays accurate after a doctor's specialty is corrected.
`doctor_appointments → doctors` is `on delete restrict` (deleting an
appointment never removes the doctor); `doctor_appointment_tasks →
doctor_appointments` is `on delete cascade`. A `reminder_at` that has passed
is sent once by the reminder cron (phase 2).

`care_entries` is a separate dated timeline (the Medical page's **Log** tab) of
things to remember between visits — an `observation` you noticed or a plain
`note`. Each entry is tagged to any number of specialties through the
`care_entry_specialties` join (both FKs `on delete cascade`), so it reads whole
or filtered to one specialty's context. `kind` may gain `decision` in a later
phase; blood/lab results went their own way (below).

`lab_panels` / `lab_markers` / `lab_results` back the Medical page's **Results**
tab — a blood-results tracker. A `lab_marker` is one measurement followed over
time (TSH, Ferritin); its `unit` and optional `ref_low` / `ref_high` reference
range live on the marker, and each `lab_result` is one dated `value`. Markers
group into user-named `lab_panels` (Hormones, Liver…) via `lab_markers.panel_id`
(composite FK `(user_id, panel_id) → lab_panels(user_id, id)`, `on delete set
null` — deleting a panel ungroups its markers); `lab_results → lab_markers` is
`on delete cascade`. Owner-only, plain `auth.uid() = user_id`. Markers and panels
are managed from the Results tab itself; values are entered one at a time from a
marker's detail or a whole blood draw at once from its **Add results** batch view
(one date and lab, a value per marker, one multi-row insert).

## Reminders → Home

The same three concepts, shared with a linked partner. Reuses Connect's
`partner_links` pairing via the `is_household_member(target_user_id)` SQL
helper — no separate "share" step, no FK to `partner_links`.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "primaryColor": "#eef1fa", "primaryBorderColor": "#4554a1",
  "primaryTextColor": "#24313a", "lineColor": "#7d8ec7",
  "fontFamily": "Inter, -apple-system, sans-serif", "fontSize": "14px"
}}}%%
erDiagram
    HOUSEHOLD_TASKS ||--o{ HOUSEHOLD_TASK_COMPLETIONS : "full history"

    HOUSEHOLD_NOTES {
        uuid id PK
        uuid owner_id FK
        text title
        text body
    }
    HOUSEHOLD_TASKS {
        uuid        id PK
        uuid        owner_id FK
        text        title
        timestamptz due_at
        int         recurrence_days "null = one-off"
        timestamptz last_completed_at
        uuid        last_completed_by FK "who completed it"
        uuid        assigned_to FK "null = either of you"
        boolean     is_archived
        timestamptz reminder_sent_at
    }
    HOUSEHOLD_TASK_COMPLETIONS {
        uuid        id PK
        uuid        task_id FK
        uuid        completed_by FK
        timestamptz completed_at
    }
    HOUSEHOLD_ITEMS {
        uuid id PK
        uuid owner_id FK
        text name
        date expires_on
        int  remind_days_before
        timestamptz reminder_sent_at
    }
```

Same one-off-vs-recurring shape as Personal, plus `last_completed_by` /
`assigned_to` so the UI can show who did it and who it's for.
`household_items` is the product-expiration tracker — standalone, no
relationship to the others. `household_codes` (discount/promo codes, not
diagrammed above) is another standalone board on the same page.

`wishlist_categories` / `wishlist_items` back the Wishlist board: a
category is a name plus an optional `icon` / `color` (an icon key and a
brand-hue key, both from fixed client-side sets — `src/components/home/wishlistIcons.tsx`),
an item is one URL plus a title (fetched by the `fetch-link-metadata`
Edge Function, or typed) and an optional note.
`wishlist_items.category_id` cascades on category delete. A category with
no `icon` / `color` falls back to a heart glyph and a position-keyed
accent. All the household tables use the pair RLS shape below.

`wishlist_share_tokens` (one row per account, `unique (owner_id)`) is a
capture token for a phone Share Sheet shortcut: iOS has no PWA share
target, so the shortcut POSTs a link to the `wishlist-share` Edge
Function with the token instead of a session. Strictly owner-only RLS —
the function reads it with the service-role key and inserts the item as
that owner into a "Saved from phone" category. Regenerating is a delete +
insert, so there's no UPDATE policy.

## Infrastructure tables

| Table | Purpose |
|---|---|
| `push_subscriptions` | One row per user — the Web Push endpoint/keys/timezone for their last device that enabled notifications. Row present = enabled. Read by the reminder cron with the service-role key. |
| `journal_entries` | Log → Journal: a freeform diary (`date`, optional `title`, `body`). Unrelated to the per-item `*_diary` tables. Written directly to Supabase. |
| `notes_digest_state` | One row per user — `last_sent_date` for the daily unread-notes digest email. Written only by the cron (service role); a client only reads its own row. |

## RLS shapes

| Tables | `using` / `with check` |
|---|---|
| All tracked-domain, standalone-log, `personal_*`, `doctor_*`, `care_ent*`, `lab_*`, and infra tables | `auth.uid() = user_id` (SELECT only for `notes_digest_state` — the cron does every write) |
| `partner_invites` | `auth.uid() = created_by` |
| `partner_links` | SELECT/DELETE only: `auth.uid() in (user_a_id, user_b_id)` — no INSERT/UPDATE (created via `redeem_partner_invite()`) |
| `notes` | SELECT/UPDATE: `auth.uid() in (sender_id, recipient_id)`. INSERT: must be yourself, to your actual linked partner, into a thread you're part of. No DELETE. |
| `household_notes` / `household_tasks` / `household_items` / `household_codes` / `household_task_completions` / `wishlist_categories` / `wishlist_items` | `auth.uid() = owner_id or is_household_member(owner_id)` — visible and editable by the creator and their one linked partner. INSERT must be as `owner_id = auth.uid()`; `wishlist_items` also checks the target category is one you can see. |
| `wishlist_share_tokens` | SELECT/INSERT/DELETE only, `auth.uid() = owner_id` — personal, never pair-visible. |

## Functions & triggers

| Name | Kind | Role |
|---|---|---|
| `redeem_partner_invite(text)` | `security definer` fn | Redeems an invite code → creates the `partner_links` row + marks the invite. Enforces every business rule (expired, already redeemed, own code, either side already linked). |
| `get_partner_email()` | `security definer` fn | Returns just the linked partner's email (the only identity Lauva has). `auth.users` isn't client-queryable otherwise. |
| `is_household_member(uuid)` | `security invoker` fn | True if the caller is linked to the given user via `partner_links`. Used in every Home RLS policy. |
| `notes_touch_thread()` | AFTER INSERT trigger | Keeps a thread root's `last_message_at` / `*_read_at` current on every insert into the thread. |
| `notes_lock_identity_columns()` | BEFORE UPDATE trigger | Rejects post-insert changes to `sender_id` / `recipient_id` / `thread_root_id`. |

Email goes out only from the `reminder-cron` Edge Function
(service role): due reminders, and a once-a-day unread-notes digest gated by
`notes_digest_state`. Notes never send a mail per message — a sent message
instead triggers an immediate web push to the recipient via the `notify-note`
Edge Function (client-invoked on send); the digest is the fallback for users
without push.

## Not in Postgres

- **Which tracked domains are visible** is a per-device localStorage
  preference ([`src/lib/visibleDomains.tsx`](../src/lib/visibleDomains.tsx)),
  deliberately not synced — "I don't track this" is a statement about the
  person using this device, not about the data.
- **The PWA app-shell cache** (`public/sw.js`) is separate from both
  Supabase and the IndexedDB data cache.
