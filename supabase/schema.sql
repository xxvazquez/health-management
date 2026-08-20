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
  item_type text not null check (item_type in ('food', 'supplement', 'habit', 'symptom')),
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
  date date not null,
  exercise text not null,
  weight_kg numeric not null,
  updated_at timestamp with time zone not null default now(),
  constraint gym_logs_pkey primary key (user_id, id),
  constraint gym_logs_user_id_fkey foreign key (user_id) references auth.users(id)
);

create index food_logs_item_date_idx on public.food_logs (item_id, date);
create index supplement_logs_item_date_idx on public.supplement_logs (item_id, date);
create index habit_logs_item_date_idx on public.habit_logs (item_id, date);
create index symptom_logs_item_date_idx on public.symptom_logs (item_id, date);
create index stool_logs_user_date_idx on public.stool_logs (user_id, date);

-- One row per user: the breakfast-reminder push subscription for whichever
-- device they last enabled it on (enabling on a second device overwrites
-- the first — one reminder per user, not per device, is enough for now).
-- Row presence = enabled; the Manage page deletes it to disable. Read by
-- the breakfast-reminder-cron Edge Function using the service role key,
-- not by the browser client, so RLS below only ever needs to cover the
-- user's own read/write from the app.
create table public.push_subscriptions (
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  -- IANA name (e.g. "Europe/Warsaw"), captured client-side at subscribe
  -- time — lets the cron job work out this user's local morning without
  -- guessing a single fixed UTC time for everyone.
  timezone text not null,
  -- Local date (in the timezone above) the reminder last actually sent —
  -- stops the 15-minute cron from sending the same person's reminder
  -- more than once in their reminder window.
  last_reminded_date date,
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
alter table public.food_logs enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.habit_logs enable row level security;
alter table public.symptom_logs enable row level security;
alter table public.food_diary enable row level security;
alter table public.supplement_diary enable row level security;
alter table public.habit_diary enable row level security;
alter table public.symptom_diary enable row level security;
alter table public.stool_logs enable row level security;
alter table public.gym_logs enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_items_all_own" on public.food_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_items_all_own" on public.supplement_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_items_all_own" on public.habit_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_items_all_own" on public.symptom_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_logs_all_own" on public.food_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_logs_all_own" on public.supplement_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_logs_all_own" on public.habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_logs_all_own" on public.symptom_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "food_diary_all_own" on public.food_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supplement_diary_all_own" on public.supplement_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit_diary_all_own" on public.habit_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "symptom_diary_all_own" on public.symptom_diary for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stool_logs_all_own" on public.stool_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gym_logs_all_own" on public.gym_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_all_own" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Breakfast reminder: schedule the Edge Function that sends it. Run this
-- once, filling in your own project ref and anon key (Dashboard -> Project
-- Settings -> API) — the anon key is public by design (see the note in
-- .github/workflows/deploy.yml), so it's fine inline here. Needs the
-- pg_cron and pg_net extensions, enabled below (Database -> Extensions in
-- the dashboard works too, if you'd rather click than paste SQL).
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
