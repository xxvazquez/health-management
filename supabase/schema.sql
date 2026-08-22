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
-- supplement item can't reference a habit category. Stool is its own
-- `stool_logs` table (one row per bowel movement) rather than a symptom.
-- Gym has no "item" dimension (an exercise + weight is the whole record),
-- so it doesn't share that shape and gets its own `gym_logs` table.

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
  -- breakfast-reminder-cron, written by the app whenever this changes.
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
-- like every other item type. `gym_logs.item_id` is a real foreign key to
-- this table (see gym_logs below), same pattern as food/supplement/habit/
-- symptom items and their logs — renaming an exercise here relabels its
-- history, same as renaming any other item. No reminder_time/
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
  -- What a gym_logs.weight_kg value means for this exercise — kg for
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
-- gym_logs row, same "shared across however many entries that day" rule as
-- every other diary table (see food_diary's own comment upstream).
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

create table public.gym_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null,
  date date not null,
  weight_kg numeric not null,
  updated_at timestamp with time zone not null default now(),
  constraint gym_logs_pkey primary key (user_id, id),
  foreign key (user_id, item_id) references public.workout_items (user_id, id) on delete restrict
);

create index food_logs_item_date_idx on public.food_logs (item_id, date);
create index supplement_logs_item_date_idx on public.supplement_logs (item_id, date);
create index habit_logs_item_date_idx on public.habit_logs (item_id, date);
create index symptom_logs_item_date_idx on public.symptom_logs (item_id, date);
create index stool_logs_user_date_idx on public.stool_logs (user_id, date);
create index gym_logs_item_date_idx on public.gym_logs (item_id, date);

-- One row per user: the push subscription for whichever device they last
-- enabled notifications on (enabling on a second device overwrites the
-- first — one subscription per user, not per device, is enough for now).
-- Row presence = enabled; the Manage page deletes it to disable. This is
-- purely the delivery mechanism (endpoint/keys/timezone) — the schedule
-- itself is per-item (see reminder_time/reminder_last_sent_date on
-- supplement_items/habit_items above). Read by the breakfast-reminder-cron
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
alter table public.gym_logs enable row level security;
alter table public.push_subscriptions enable row level security;

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
create policy "gym_logs_all_own" on public.gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_all_own" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reminders: schedule the Edge Function that checks and sends them (still
-- named breakfast-reminder-cron — it now walks every supplement/habit
-- item's own reminder_time rather than one fixed breakfast check, but the
-- function's deployed name is a live URL a running pg_cron job already
-- calls, so renaming it would need this schedule re-pointed by hand too).
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
--   'breakfast-reminder-cron',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/breakfast-reminder-cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_ANON_KEY', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- Migration for a project that already ran the create table statements
-- above before per-item reminders existed: run once by hand in the SQL
-- editor (already applied to the live lauva.pl project as of this change).
--
-- alter table public.supplement_items add column if not exists reminder_time time;
-- alter table public.supplement_items add column if not exists reminder_last_sent_date date;
-- alter table public.habit_items add column if not exists reminder_time time;
-- alter table public.habit_items add column if not exists reminder_last_sent_date date;
-- alter table public.push_subscriptions drop column if exists last_reminded_date;

-- Migration for a project that already ran the create table statements
-- above before workouts had categories/items of their own (exercises were
-- a fixed hardcoded list): run once by hand in the SQL editor (already
-- applied to the live lauva.pl project as of this change). gym_logs itself
-- is untouched — still plain exercise text, matched by name at the app
-- layer, not migrated to a foreign key (see workout_items' own comment
-- upstream for why). Backfills one workout_items row, under a seeded
-- "Strength Training" category, for every exercise name that already
-- shows up in that user's existing gym_logs.
--
-- alter table public.categories drop constraint if exists categories_item_type_check;
-- alter table public.categories add constraint categories_item_type_check check (item_type in ('food', 'supplement', 'habit', 'symptom', 'workout'));
--
-- create table public.workout_items ( ... );  -- see CREATE TABLE public.workout_items above
-- create table public.workout_diary ( ... );  -- see CREATE TABLE public.workout_diary above
-- alter table public.workout_items enable row level security;
-- alter table public.workout_diary enable row level security;
-- create policy "workout_items_all_own" on public.workout_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "workout_diary_all_own" on public.workout_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- insert into public.categories (user_id, item_type, name)
-- select distinct user_id, 'workout', 'Strength Training'
-- from public.gym_logs
-- on conflict (user_id, item_type, name_key) do nothing;
--
-- insert into public.workout_items (user_id, name, category_id)
-- select distinct g.user_id, g.exercise, c.id
-- from public.gym_logs g
-- join public.categories c
--   on c.user_id = g.user_id and c.item_type = 'workout' and c.name = 'Strength Training'
-- on conflict (user_id, name_key) do nothing;

-- Migration for a project that already ran the workout_items create table
-- statement above before exercises had a unit of their own (every exercise
-- was implicitly kg): run once by hand in the SQL editor (already applied
-- to the live lauva.pl project as of this change). Every existing row
-- defaults to 'kg', matching what it already meant. The constraint-drop
-- line is a no-op (and safe to run) if you never applied the earlier,
-- more restrictive version of this migration.
--
-- alter table public.workout_items add column if not exists unit text not null default 'kg';
-- alter table public.workout_items drop constraint if exists workout_items_unit_check;

-- Migration for a project that already ran the gym_logs create table
-- statement above before it referenced workout_items by a real foreign key
-- (exercise used to be plain text, matched by name at the app layer — see
-- workout_items' own comment upstream, now updated). This one is
-- destructive: it drops and recreates gym_logs, so it's only safe to run if
-- you're fine losing existing gym history (re-log it afterwards). It does
-- NOT touch food/supplement/habit/symptom/stool data or workout_items
-- itself — only gym_logs.
--
-- drop table public.gym_logs;
--
-- create table public.gym_logs (
--   id uuid not null default gen_random_uuid(),
--   user_id uuid not null default auth.uid(),
--   item_id uuid not null,
--   date date not null,
--   weight_kg numeric not null,
--   updated_at timestamp with time zone not null default now(),
--   constraint gym_logs_pkey primary key (user_id, id),
--   foreign key (user_id, item_id) references public.workout_items (user_id, id) on delete restrict
-- );
-- create index gym_logs_item_date_idx on public.gym_logs (item_id, date);
-- alter table public.gym_logs enable row level security;
-- create policy "gym_logs_all_own" on public.gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
