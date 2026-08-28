-- Lauva's Supabase schema.
--
-- Run this once in a fresh project's SQL editor (Dashboard -> SQL Editor)
-- before pointing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
-- at it. Every table is scoped per-user via row-level security: a signed-in
-- user only ever sees their own rows, and `user_id` defaults to `auth.uid()`
-- so the app never has to pass it explicitly on insert.
--
-- One item table, one log table, and one diary table per tracked type
-- (food/supplement/habit/symptom), plus a shared `categories` table each
-- item type's rows point into. Every foreign key between user-owned tables
-- is a composite key on (user_id, id) — not just id — so a row can never
-- reference a parent row belonging to a different user regardless of RLS;
-- the category foreign keys additionally carry item_type, so e.g. a
-- supplement item can't reference a habit category. Stool is the one
-- outlier: its own `stool_logs` table (one row per bowel movement) with
-- no item/category dimension at all, rather than a symptom.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_type text not null check (item_type in ('food', 'supplement', 'habit', 'symptom', 'workout')),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  unique (user_id, item_type, name_key),
  unique (user_id, id, item_type)
);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  item_type text not null default 'food' check (item_type = 'food'),
  category_id uuid not null,
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  unique (user_id, name_key),
  unique (user_id, id),
  foreign key (user_id, category_id, item_type) references public.categories (user_id, id, item_type) on delete restrict
);

create table public.supplement_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  item_type text not null default 'supplement' check (item_type = 'supplement'),
  category_id uuid not null,
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  -- Local wall-clock time-of-day; null means no reminder is set. Read by
  -- reminder-cron, written by the app whenever this changes.
  reminder_time time,
  -- Local date this item's reminder last sent or resolved (already logged)
  -- — the per-item dedupe guard, reset to null whenever reminder_time
  -- itself changes so a same-day retime isn't suppressed by an earlier
  -- send. Never touched by a plain rename/archive/category-change upsert;
  -- see src/lib/supabase/sync.ts's setItemReminderTimeAndSync.
  reminder_last_sent_date date,
  unique (user_id, name_key),
  unique (user_id, id),
  foreign key (user_id, category_id, item_type) references public.categories (user_id, id, item_type) on delete restrict
);

create table public.habit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  item_type text not null default 'habit' check (item_type = 'habit'),
  category_id uuid not null,
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  reminder_time time,
  reminder_last_sent_date date,
  unique (user_id, name_key),
  unique (user_id, id),
  foreign key (user_id, category_id, item_type) references public.categories (user_id, id, item_type) on delete restrict
);

create table public.symptom_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  item_type text not null default 'symptom' check (item_type = 'symptom'),
  category_id uuid not null,
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  unique (user_id, name_key),
  unique (user_id, id),
  foreign key (user_id, category_id, item_type) references public.categories (user_id, id, item_type) on delete restrict
);

-- Which exercises exist, their category, and archive state — the registry
-- Manage/the Log page's Workout tab read to know what to offer, exactly
-- like every other item type. `workout_logs.item_id` is a real foreign key
-- to this table (see workout_logs below), same pattern as food/supplement/
-- habit/symptom items and their logs — renaming an exercise here relabels
-- its history, same as renaming any other item. No reminder_time/
-- reminder_last_sent_date — reminders don't apply to workouts.
create table public.workout_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  item_type text not null default 'workout' check (item_type = 'workout'),
  category_id uuid not null,
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  -- What a workout_logs.weight_kg value means for this exercise — kg for
  -- strength work, minutes for a timed session (yoga, a run), reps for a
  -- bodyweight count, or anything else typed in on Manage. Free text, not
  -- constrained to those three — they're just the built-in starting
  -- suggestions. Defaults to 'kg' since every exercise before units
  -- existed was strength work.
  unit text not null default 'kg',
  unique (user_id, name_key),
  unique (user_id, id),
  foreign key (user_id, category_id, item_type) references public.categories (user_id, id, item_type) on delete restrict
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  value numeric,
  meal_tag text,
  updated_at timestamptz not null default now(),
  foreign key (user_id, item_id) references public.food_items (user_id, id) on delete restrict
);

create table public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  value numeric,
  -- Morning/Afternoon/Night — same idea and column as food_logs.meal_tag,
  -- for a supplement taken more than once a day.
  meal_tag text,
  updated_at timestamptz not null default now(),
  foreign key (user_id, item_id) references public.supplement_items (user_id, id) on delete restrict
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  value numeric,
  updated_at timestamptz not null default now(),
  foreign key (user_id, item_id) references public.habit_items (user_id, id) on delete restrict
);

create table public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  value numeric,
  updated_at timestamptz not null default now(),
  foreign key (user_id, item_id) references public.symptom_items (user_id, id) on delete restrict
);

create table public.food_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  content text,
  title text,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, date),
  foreign key (user_id, item_id) references public.food_items (user_id, id) on delete restrict
);

create table public.supplement_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  content text,
  title text,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, date),
  foreign key (user_id, item_id) references public.supplement_items (user_id, id) on delete restrict
);

create table public.habit_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  content text,
  title text,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, date),
  foreign key (user_id, item_id) references public.habit_items (user_id, id) on delete restrict
);

create table public.symptom_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  content text,
  title text,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, date),
  foreign key (user_id, item_id) references public.symptom_items (user_id, id) on delete restrict
);

-- One note per exercise per day — item_id is workout_items, not a specific
-- workout_logs row, same "shared across however many entries that day" rule
-- as every other diary table (see food_diary's own comment upstream).
create table public.workout_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  item_id uuid not null,
  date date not null,
  content text,
  title text,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id, date),
  foreign key (user_id, item_id) references public.workout_items (user_id, id) on delete restrict
);

create table public.stool_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  logged_at timestamptz not null default now(),
  -- One bowel movement can include more than one consistency (e.g. both a
  -- Type 1 and a Type 3 piece), so this is an array, not a single value.
  -- Empty exactly when no_bristol is true (enforced by the check below).
  bristol_scores smallint[] not null default '{}'::smallint[]
    check (bristol_scores <@ array[1,2,3,4,5,6,7]::smallint[]),
  no_bristol boolean not null default false,
  color text check (color in ('Brown', 'Dark Brown', 'Light Brown', 'Green', 'Yellow')),
  -- Null means neither observed — a normal sinking stool isn't itself
  -- trackable, only the two notable states are.
  floatation text check (floatation in ('Partially Floats', 'Floats')),
  is_sticky boolean not null default false,
  is_smelly boolean not null default false,
  is_straining boolean not null default false,
  has_mucus boolean not null default false,
  has_urgency boolean not null default false,
  has_visible_food_particles boolean not null default false,
  has_incomplete_evacuation boolean not null default false,
  paper_cleanliness text check (paper_cleanliness in ('Clean', 'Slightly Dirty', 'Dirty', 'Very Dirty')),
  time_on_toilet_minutes smallint check (time_on_toilet_minutes between 1 and 60),
  note text,
  updated_at timestamptz not null default now(),
  check (
    (cardinality(bristol_scores) > 0 and not no_bristol)
    or
    (cardinality(bristol_scores) = 0 and no_bristol)
  )
);

create table public.workout_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null,
  date date not null,
  weight_kg numeric not null,
  updated_at timestamp with time zone not null default now(),
  constraint workout_logs_pkey primary key (user_id, id),
  foreign key (user_id, item_id) references public.workout_items (user_id, id) on delete restrict
);

-- One row per calendar day flagged as a period day — no item/category of
-- its own, same standalone shape as stool_logs. A day's presence in this
-- table (not a separate boolean) is what "on your period" means; deleting
-- the row un-marks the day. Period/cycle length, current cycle day, and
-- predictions are all derived from this table's dates at the app layer,
-- not stored — see src/lib/aggregations/cycle.ts.
create table public.period_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  intensity text not null check (intensity in ('Light', 'Medium', 'Heavy', 'Super Heavy')),
  -- Free text, not constrained to the app's four suggested chips — same
  -- reasoning as workout_items.unit: a value logged elsewhere (or
  -- imported from historical data) stays intact even if it isn't one of
  -- the chips offered in Manage/Log.
  collection_methods text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Connect -> Notes: private partner-to-partner messages. Two users become
-- "partners" by redeeming a short-lived invite code (partner_invites) into
-- a partner_links row; every note then flows between exactly those two
-- users. A user can be linked to at most one partner at a time — enforced
-- in redeem_partner_invite below, not by a table constraint (a two-column
-- symmetric "no user appears twice" rule isn't expressible as a plain
-- unique index).
create table public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz
);

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id),
  user_b_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id)
);

-- Redeeming an invite means looking up a row by `code` that the redeemer
-- doesn't own per RLS (they're not `created_by`), then inserting a
-- partner_links row and touching the invite as a single atomic unit —
-- exactly the kind of cross-user side effect this schema otherwise never
-- needs, so it's a security-definer function (runs as the table owner,
-- which bypasses RLS) rather than a relaxed policy. `for update` locks the
-- invite row for the transaction so two near-simultaneous redemptions of
-- the same code can't both succeed.
create or replace function public.redeem_partner_invite(invite_code text)
returns public.partner_links
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.partner_invites;
  new_link public.partner_links;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into invite from public.partner_invites where code = invite_code for update;

  if invite is null then
    raise exception 'Invalid invite code';
  end if;
  if invite.redeemed_by is not null then
    raise exception 'This invite has already been used';
  end if;
  if invite.expires_at < now() then
    raise exception 'This invite has expired';
  end if;
  if invite.created_by = auth.uid() then
    raise exception 'You cannot redeem your own invite';
  end if;
  if exists (select 1 from public.partner_links where auth.uid() in (user_a_id, user_b_id)) then
    raise exception 'You already have a linked partner';
  end if;
  if exists (select 1 from public.partner_links where invite.created_by in (user_a_id, user_b_id)) then
    raise exception 'That person already has a linked partner';
  end if;

  insert into public.partner_links (user_a_id, user_b_id)
  values (invite.created_by, auth.uid())
  returning * into new_link;

  update public.partner_invites set redeemed_by = auth.uid(), redeemed_at = now() where id = invite.id;

  return new_link;
end;
$$;

revoke all on function public.redeem_partner_invite(text) from public;
grant execute on function public.redeem_partner_invite(text) to authenticated;

-- `auth.users` isn't queryable by a regular signed-in client at all (no
-- RLS story on it applies here — it's simply not exposed), so this is the
-- only way the Notes UI can show "who am I talking to" (an email, since
-- that's the only identity Lauva has for anyone). Security definer, same
-- reasoning as redeem_partner_invite above, deliberately returns nothing
-- but this one field — never anything else from auth.users. Null when the
-- caller has no linked partner.
create or replace function public.get_partner_email()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
  from public.partner_links pl
  join auth.users u on u.id = (case when pl.user_a_id = auth.uid() then pl.user_b_id else pl.user_a_id end)
  where auth.uid() in (pl.user_a_id, pl.user_b_id)
  limit 1;
$$;

revoke all on function public.get_partner_email() from public;
grant execute on function public.get_partner_email() to authenticated;

-- Every note AND every reply is a row here — a reply is just a note with
-- `thread_root_id` set to the top-level note's id (and sender/recipient
-- flipped), so threading needs no separate table. The columns below the
-- comment are meaningful on the ROOT row only (a reply never reads or
-- writes its own copy) — "sender"/"recipient" there always mean the
-- thread's two fixed participants (the root's), never whoever happens to
-- have sent the latest reply. `notes_touch_thread` below keeps them
-- current as replies arrive.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  thread_root_id uuid references public.notes(id),
  category text not null default 'note' check (category in ('note', 'reminder', 'appreciation', 'question')),
  subject text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  -- Root-only: when the thread last had any activity (root or reply) —
  -- lets the inbox list sort/show recency without a join per row.
  last_message_at timestamptz not null default now(),
  -- Root-only: last time each fixed participant "opened" this thread. Null
  -- means never read. Unread-for-a-participant = their column is null or
  -- older than last_message_at — computed at the app layer, not stored as
  -- its own boolean, so a new reply makes a thread unread again for free.
  sender_read_at timestamptz,
  recipient_read_at timestamptz,
  -- Root-only, independent per side — sender and recipient organize their
  -- own copy of a thread separately (favouriting/archiving something you
  -- sent doesn't affect your partner's view of it, and vice versa).
  sender_favourited boolean not null default false,
  recipient_favourited boolean not null default false,
  sender_archived boolean not null default false,
  recipient_archived boolean not null default false
);

create index notes_recipient_idx on public.notes (recipient_id, last_message_at desc) where thread_root_id is null;
create index notes_sender_idx on public.notes (sender_id, last_message_at desc) where thread_root_id is null;
create index notes_thread_idx on public.notes (thread_root_id);

-- Keeps a root's last_message_at/*_read_at current on every insert into its
-- thread (including the root's own insert, where root_id = new.id — a
-- harmless self-update, not a trigger loop, since this is an UPDATE not an
-- INSERT). Whoever just sent this message has implicitly "read" the thread
-- up to it; the other side's read_at is left untouched, so last_message_at
-- moving past it is what makes the thread unread again for them.
create or replace function public.notes_touch_thread() returns trigger
language plpgsql as $$
declare
  root_id uuid := coalesce(new.thread_root_id, new.id);
begin
  update public.notes n
  set
    last_message_at = new.created_at,
    sender_read_at = case when new.sender_id = n.sender_id then new.created_at else n.sender_read_at end,
    recipient_read_at = case when new.sender_id = n.recipient_id then new.created_at else n.recipient_read_at end
  where n.id = root_id;
  return new;
end;
$$;

create trigger notes_touch_thread_trigger
  after insert on public.notes
  for each row execute function public.notes_touch_thread();

-- sender_id/recipient_id/thread_root_id are a note's identity — nothing in
-- the app ever legitimately changes who a note was between or what thread
-- it's in after the fact, so this closes the one gap the shared "either
-- participant can UPDATE" policy below leaves open (RLS's WITH CHECK on
-- UPDATE only constrains the *new* row, not whether it matches the old
-- one — see this table's own policies for why that's fine for
-- read/favourite/archive but not for identity).
create or replace function public.notes_lock_identity_columns() returns trigger
language plpgsql as $$
begin
  if new.sender_id <> old.sender_id or new.recipient_id <> old.recipient_id or new.thread_root_id is distinct from old.thread_root_id then
    raise exception 'sender_id, recipient_id, and thread_root_id cannot be changed after a note is created';
  end if;
  return new;
end;
$$;

create trigger notes_lock_identity_columns_trigger
  before update on public.notes
  for each row execute function public.notes_lock_identity_columns();

create index food_logs_item_date_idx on public.food_logs (item_id, date);
create index supplement_logs_item_date_idx on public.supplement_logs (item_id, date);
create index habit_logs_item_date_idx on public.habit_logs (item_id, date);
create index symptom_logs_item_date_idx on public.symptom_logs (item_id, date);
create index stool_logs_user_date_idx on public.stool_logs (user_id, date);
create index workout_logs_item_date_idx on public.workout_logs (item_id, date);
create index period_logs_user_date_idx on public.period_logs (user_id, date);
-- These four log tables had no index with `user_id` as a leading column —
-- every one of them is fetched by the client as `select * ... where user_id
-- = ...` on every sync pull (see fetchAllRows in src/lib/supabase/sync.ts),
-- exactly the access pattern stool_logs/period_logs' own (user_id, date)
-- indexes above already cover, so this brings the other four log tables up
-- to the same standard rather than leaving them to a sequential scan.
create index food_logs_user_date_idx on public.food_logs (user_id, date);
create index supplement_logs_user_date_idx on public.supplement_logs (user_id, date);
create index habit_logs_user_date_idx on public.habit_logs (user_id, date);
create index symptom_logs_user_date_idx on public.symptom_logs (user_id, date);

-- One row per user: the push subscription for whichever device they last
-- enabled notifications on (enabling on a second device overwrites the
-- first — one subscription per user, not per device, is enough for now).
-- Row presence = enabled; the Manage page deletes it to disable. This is
-- purely the delivery mechanism (endpoint/keys/timezone) — the schedule
-- itself is per-item (see reminder_time/reminder_last_sent_date on
-- supplement_items/habit_items above). Read by the reminder-cron
-- Edge Function using the service role key, not by the browser client, so
-- RLS below only ever needs to cover the user's own read/write from the app.
create table public.push_subscriptions (
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  -- IANA name (e.g. "Europe/Warsaw"), captured client-side at subscribe
  -- time and refreshed on every app load if it's drifted — lets the cron
  -- job work out this user's local time without guessing a single fixed
  -- UTC time for everyone.
  timezone text not null,
  updated_at timestamp with time zone not null default now(),
  constraint push_subscriptions_pkey primary key (user_id),
  constraint push_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- Log -> Journal: a personal freeform journal entry, one row per entry.
-- Unrelated to food_diary/supplement_diary/etc. above (those are a single
-- optional note attached to one specific logged item on one specific day,
-- synced through the outbox) — this has no item of its own and is written
-- and read directly against Supabase instead, same pattern as `notes` (see
-- src/lib/supabase/journal.ts), since an entry is written once in a sitting
-- and edited occasionally rather than logged repeatedly.
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  date date not null,
  title text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_entries_user_date_idx on public.journal_entries (user_id, date desc, created_at desc);

-- One row per user: the last date they were sent their daily unread-notes
-- digest email (see reminder-cron's notes-digest phase). Notes
-- no longer email on every message — instead this cron sends at most one
-- "you have N unread notes" summary per day. Written only by that Edge
-- Function with the service role; a client only ever reads its own row.
create table public.notes_digest_state (
  user_id uuid primary key default auth.uid() references auth.users(id),
  last_sent_date date,
  updated_at timestamptz not null default now()
);

-- Reminders -> Personal: private to one user, same ownership shape as
-- journal_entries above (no offline/outbox — written directly against
-- Supabase). A "task" covers both a one-off deadline and a recurring chore:
-- recurrence_days null means one-off (last_completed_at, once set, means
-- done); recurrence_days set means recurring (due_at is the *next* due
-- instance, advanced by recurrence_days on every completion, and the task
-- never becomes permanently "done"). reminder_sent_at is the idempotency
-- stamp for the current due_at occurrence — cleared whenever due_at
-- advances so the next occurrence can remind again; see the "Reminders"
-- cron section below.
create table public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  title text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  due_at timestamptz,
  recurrence_days int check (recurrence_days is null or recurrence_days > 0),
  last_completed_at timestamptz,
  -- Retired from the active list without losing its history — mainly for a
  -- recurring chore you've stopped doing (a one-off task just gets deleted
  -- or left completed). Never reminded on while archived (see the cron).
  is_archived boolean not null default false,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every completion of a recurring personal_tasks row, not just the latest
-- (last_completed_at above is a denormalized copy for fast display).
create table public.personal_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.personal_tasks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  completed_at timestamptz not null default now()
);

-- Log -> Expiration: the private counterpart to household_items below —
-- products/supplements tracked by expiry date, owned by one user. Same
-- standalone shape and remind_days_before logic as household_items; the
-- only difference is user_id + the owner-only policy instead of the shared
-- household one.
create table public.personal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(trim(name)) > 0),
  expires_on date not null,
  remind_days_before int not null default 3 check (remind_days_before >= 0),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_notes_user_updated_idx on public.personal_notes (user_id, updated_at desc);
create index personal_tasks_user_due_idx on public.personal_tasks (user_id, due_at);
create index personal_task_completions_task_idx on public.personal_task_completions (task_id, completed_at desc);
create index personal_items_user_expires_idx on public.personal_items (user_id, expires_on);

-- Reminders -> Home: the same three concepts as Personal above, but shared
-- with a linked partner (see partner_links, defined earlier) instead of
-- owned outright. `owner_id` is whoever created the row; visibility/edit
-- rights extend to their linked partner via is_household_member below, so
-- either person can view, edit, and complete the other's rows — same
-- "shared, not just visible" rule Notes uses for reading/archiving/
-- favouriting a thread either participant is part of.
create or replace function public.is_household_member(target_user_id uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1 from public.partner_links pl
    where (pl.user_a_id = target_user_id and pl.user_b_id = auth.uid())
       or (pl.user_b_id = target_user_id and pl.user_a_id = auth.uid())
  );
$$;

create table public.household_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(trim(title)) > 0),
  notes text,
  due_at timestamptz,
  recurrence_days int check (recurrence_days is null or recurrence_days > 0),
  last_completed_at timestamptz,
  last_completed_by uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  is_archived boolean not null default false,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.household_tasks(id) on delete cascade,
  completed_by uuid not null default auth.uid() references auth.users(id),
  completed_at timestamptz not null default now()
);

-- Home -> Expiration: household products/items tracked by expiry date, not
-- tied to any item/category dimension elsewhere in this schema (its own
-- standalone shape, same reasoning as stool_logs/period_logs). Reminders
-- fire remind_days_before the expiry date — see the cron section below.
create table public.household_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(trim(name)) > 0),
  expires_on date not null,
  remind_days_before int not null default 3 check (remind_days_before >= 0),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_notes_owner_updated_idx on public.household_notes (owner_id, updated_at desc);
create index household_tasks_owner_due_idx on public.household_tasks (owner_id, due_at);
create index household_task_completions_task_idx on public.household_task_completions (task_id, completed_at desc);
create index household_items_owner_expires_idx on public.household_items (owner_id, expires_on);

-- Row-level security: every table, same shape — a user can only read or
-- write rows where user_id matches their own auth.uid().
alter table public.categories enable row level security;
alter table public.food_items enable row level security;
alter table public.supplement_items enable row level security;
alter table public.habit_items enable row level security;
alter table public.symptom_items enable row level security;
alter table public.workout_items enable row level security;
alter table public.food_logs enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.habit_logs enable row level security;
alter table public.symptom_logs enable row level security;
alter table public.food_diary enable row level security;
alter table public.supplement_diary enable row level security;
alter table public.habit_diary enable row level security;
alter table public.symptom_diary enable row level security;
alter table public.workout_diary enable row level security;
alter table public.stool_logs enable row level security;
alter table public.workout_logs enable row level security;
alter table public.period_logs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.notes_digest_state enable row level security;
alter table public.partner_invites enable row level security;
alter table public.partner_links enable row level security;
alter table public.notes enable row level security;
alter table public.personal_notes enable row level security;
alter table public.personal_tasks enable row level security;
alter table public.personal_task_completions enable row level security;
alter table public.personal_items enable row level security;
alter table public.household_notes enable row level security;
alter table public.household_tasks enable row level security;
alter table public.household_task_completions enable row level security;
alter table public.household_items enable row level security;

create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_items_all_own" on public.food_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_items_all_own" on public.supplement_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_items_all_own" on public.habit_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_items_all_own" on public.symptom_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout_items_all_own" on public.workout_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_logs_all_own" on public.food_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_logs_all_own" on public.supplement_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_logs_all_own" on public.habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_logs_all_own" on public.symptom_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_diary_all_own" on public.food_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_diary_all_own" on public.supplement_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_diary_all_own" on public.habit_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_diary_all_own" on public.symptom_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout_diary_all_own" on public.workout_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stool_logs_all_own" on public.stool_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout_logs_all_own" on public.workout_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "period_logs_all_own" on public.period_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_all_own" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_entries_all_own" on public.journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Select only — the cron (service role) does every write; a client has no
-- reason to touch this and shouldn't be able to reset its own digest state.
create policy "notes_digest_state_select_own" on public.notes_digest_state for select using (auth.uid() = user_id);
create policy "personal_notes_all_own" on public.personal_notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_tasks_all_own" on public.personal_tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_task_completions_all_own" on public.personal_task_completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_items_all_own" on public.personal_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- partner_invites: only the creator can see/manage their own pending
-- invite (e.g. to show "your code is still waiting"). Redemption by the
-- *other* person goes through redeem_partner_invite above, which bypasses
-- RLS as a security-definer function — nothing here needs to grant a
-- stranger SELECT access to look a code up themselves.
create policy "partner_invites_all_own" on public.partner_invites for all using (auth.uid() = created_by) with check (auth.uid() = created_by);

-- partner_links: visible to either linked participant. No INSERT/UPDATE
-- policy at all — the only way a link is created is redeem_partner_invite
-- (security definer, bypasses RLS); regular clients can only read their
-- own link and delete it (unlinking).
create policy "partner_links_select_participant" on public.partner_links for select using (auth.uid() = user_a_id or auth.uid() = user_b_id);
create policy "partner_links_delete_participant" on public.partner_links for delete using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- notes: visible to either participant. Insert must be as yourself, to
-- your actual linked partner (not any user_id a buggy/malicious client
-- might set — see the exists() subquery against partner_links), and a
-- reply's thread_root_id must point at a thread you're actually part of.
-- Update is shared between both participants (read/favourite/archive are
-- all legitimately theirs to set) — see notes_lock_identity_columns above
-- for why sender_id/recipient_id/thread_root_id don't ride along on that
-- same policy. No delete policy: archiving is the retirement path, same
-- "no hard delete" rule as every item type elsewhere in this schema.
create policy "notes_select_participant" on public.notes for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
-- The thread_root_id reference inside the exists() below MUST be qualified
-- as `notes.thread_root_id` (the new row being inserted), not left bare —
-- `notes` itself has a thread_root_id column, so an unqualified reference
-- resolves to the subquery's OWN `root.thread_root_id` instead (the
-- closest matching scope wins), silently turning the check into
-- `root.id = root.thread_root_id` — never true for a real reply. That bug
-- meant every reply, from anyone, was always rejected here; caught by
-- supabase/tests/rls.test.sql's reply-insert check, not by hand-testing.
create policy "notes_insert_to_partner" on public.notes for insert with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.partner_links pl
    where (pl.user_a_id = auth.uid() and pl.user_b_id = recipient_id)
       or (pl.user_b_id = auth.uid() and pl.user_a_id = recipient_id)
  )
  and (
    thread_root_id is null
    or exists (
      select 1 from public.notes root
      where root.id = notes.thread_root_id
        and (root.sender_id = auth.uid() or root.recipient_id = auth.uid())
    )
  )
);
create policy "notes_update_participant" on public.notes for update using (auth.uid() = sender_id or auth.uid() = recipient_id) with check (auth.uid() = sender_id or auth.uid() = recipient_id);

-- household_notes/household_tasks/household_items: visible to the owner and
-- their linked partner (is_household_member, defined with these tables
-- above); insert is always as yourself. update/delete are pair-wide too —
-- unlike notes' identity columns, there's no per-row "which side am I"
-- distinction to lock down, so a plain shared using()/with check() is
-- enough for either partner to edit or complete the other's row.
create policy "household_notes_select_pair" on public.household_notes for select using (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_notes_insert_own" on public.household_notes for insert with check (auth.uid() = owner_id);
create policy "household_notes_update_pair" on public.household_notes for update using (auth.uid() = owner_id or public.is_household_member(owner_id)) with check (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_notes_delete_pair" on public.household_notes for delete using (auth.uid() = owner_id or public.is_household_member(owner_id));

create policy "household_tasks_select_pair" on public.household_tasks for select using (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_tasks_insert_own" on public.household_tasks for insert with check (auth.uid() = owner_id);
create policy "household_tasks_update_pair" on public.household_tasks for update using (auth.uid() = owner_id or public.is_household_member(owner_id)) with check (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_tasks_delete_pair" on public.household_tasks for delete using (auth.uid() = owner_id or public.is_household_member(owner_id));

create policy "household_items_select_pair" on public.household_items for select using (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_items_insert_own" on public.household_items for insert with check (auth.uid() = owner_id);
create policy "household_items_update_pair" on public.household_items for update using (auth.uid() = owner_id or public.is_household_member(owner_id)) with check (auth.uid() = owner_id or public.is_household_member(owner_id));
create policy "household_items_delete_pair" on public.household_items for delete using (auth.uid() = owner_id or public.is_household_member(owner_id));

-- household_task_completions has no owner_id of its own (it's a log of
-- who/when, not a thing anyone "owns"), so its policies join back to the
-- parent task's pair-visibility instead. No update policy — a completion
-- record is immutable once inserted, same "no editing history" rule as
-- notes' read-receipt timestamps.
create policy "household_task_completions_select_pair" on public.household_task_completions for select using (
  exists (select 1 from public.household_tasks t where t.id = task_id and (auth.uid() = t.owner_id or public.is_household_member(t.owner_id)))
);
create policy "household_task_completions_insert_pair" on public.household_task_completions for insert with check (
  completed_by = auth.uid()
  and exists (select 1 from public.household_tasks t where t.id = task_id and (auth.uid() = t.owner_id or public.is_household_member(t.owner_id)))
);
create policy "household_task_completions_delete_pair" on public.household_task_completions for delete using (
  exists (select 1 from public.household_tasks t where t.id = task_id and (auth.uid() = t.owner_id or public.is_household_member(t.owner_id)))
);

-- Schedule the reminder-cron Edge Function: it walks every supplement/
-- habit item's reminder_time, plus personal_tasks/household_tasks (due_at)
-- and personal_items/household_items (expires_on - remind_days_before) for
-- anything due, and sends the daily unread-notes digest.
-- Run this once, filling in your own project ref and anon key (Dashboard ->
-- Project Settings -> API) — the anon key is public by design (see the
-- note in .github/workflows/deploy.yml), so it's fine inline here. Needs
-- the pg_cron and pg_net extensions, enabled below (Database -> Extensions
-- in the dashboard works too, if you'd rather click than paste SQL).
--
-- create extension if not exists pg_cron with schema extensions;
-- create extension if not exists pg_net with schema extensions;
--
-- select cron.schedule(
--   'reminder-cron',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/reminder-cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_ANON_KEY', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
--   $$
-- );
