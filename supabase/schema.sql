-- Lauva's Supabase schema.
--
-- Run this once in a fresh project's SQL editor (Dashboard -> SQL Editor)
-- before pointing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
-- at it. Every table is scoped per-user via row-level security: a signed-in
-- user only ever sees their own rows, and `user_id` defaults to `auth.uid()`
-- so the app never has to pass it explicitly on insert.
--
-- items/logs/diary/user_overrides back every page except Gym. gym_logs is
-- separate: it has no "item" dimension (an exercise + weight is the whole
-- record), so it doesn't share the items/logs shape the rest of the app
-- uses.

create table public.items (
  identity text not null,
  user_id uuid not null default auth.uid(),
  raw_name text not null,
  unit text,
  kind text,
  frequency text,
  is_removed boolean not null default false,
  -- User-controlled, reversible "I don't do this anymore" — unlike
  -- is_removed, an archived item's full history stays in every analysis;
  -- only the Log page's tap-candidate pool hides it.
  is_archived boolean not null default false,
  created_date date,
  updated_at timestamp with time zone not null default now(),
  constraint items_pkey primary key (user_id, identity),
  constraint items_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.logs (
  identity text not null,
  user_id uuid not null default auth.uid(),
  item_identity text not null,
  date date not null,
  value numeric,
  goal_value numeric,
  is_skipped boolean not null default false,
  updated_at bigint,
  meal_tag text,
  constraint logs_pkey primary key (user_id, identity),
  constraint logs_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.diary (
  identity text not null,
  user_id uuid not null default auth.uid(),
  item_identity text not null,
  date date not null,
  content text,
  title text,
  updated_at bigint,
  constraint diary_pkey primary key (user_id, identity),
  constraint diary_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table public.user_overrides (
  key text not null,
  user_id uuid not null default auth.uid(),
  canonical_name text not null,
  item_type text not null,
  category text not null,
  subcategory text not null,
  constraint user_overrides_pkey primary key (user_id, key),
  constraint user_overrides_user_id_fkey foreign key (user_id) references auth.users(id)
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

-- A user-defined category name for one item type, managed from the Manage
-- page. Food's categories are fixed in code (they're load-bearing for the
-- nutrition-guidance engine), so this only ever holds supplement/outcome/
-- habit rows in practice. A type with no rows here just falls back to that
-- type's built-in default list — rows only exist once someone has actually
-- customized that type's categories.
create table public.user_categories (
  user_id uuid not null default auth.uid(),
  item_type text not null,
  name text not null,
  constraint user_categories_pkey primary key (user_id, item_type, name),
  constraint user_categories_user_id_fkey foreign key (user_id) references auth.users(id)
);

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
alter table public.items enable row level security;
alter table public.logs enable row level security;
alter table public.diary enable row level security;
alter table public.user_overrides enable row level security;
alter table public.gym_logs enable row level security;
alter table public.user_categories enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "items_all_own" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "logs_all_own" on public.logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "diary_all_own" on public.diary
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_overrides_all_own" on public.user_overrides
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "gym_logs_all_own" on public.gym_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_categories_all_own" on public.user_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_subscriptions_all_own" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

-- Migrations for a project provisioned before a given date — run only the
-- ones after your project's setup date, each is safe to run once.

-- 2026-08: adds explicit, user-toggleable habit/supplement archiving.
-- alter table public.items add column if not exists is_archived boolean not null default false;

-- 2026-08: adds user-managed categories for supplements/symptoms/habits (Manage page).
-- create table public.user_categories (
--   user_id uuid not null default auth.uid(),
--   item_type text not null,
--   name text not null,
--   constraint user_categories_pkey primary key (user_id, item_type, name),
--   constraint user_categories_user_id_fkey foreign key (user_id) references auth.users(id)
-- );
-- alter table public.user_categories enable row level security;
-- create policy "user_categories_all_own" on public.user_categories
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2026-08: adds the breakfast reminder (push_subscriptions table + its
-- scheduled Edge Function trigger). See the "Breakfast reminder" section
-- above for the matching cron.schedule() call — run both together.
-- create table public.push_subscriptions (
--   user_id uuid not null default auth.uid(),
--   endpoint text not null,
--   p256dh text not null,
--   auth_key text not null,
--   timezone text not null,
--   last_reminded_date date,
--   updated_at timestamp with time zone not null default now(),
--   constraint push_subscriptions_pkey primary key (user_id),
--   constraint push_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id)
-- );
-- alter table public.push_subscriptions enable row level security;
-- create policy "push_subscriptions_all_own" on public.push_subscriptions
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
