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

-- Row-level security: every table, same shape — a user can only read or
-- write rows where user_id matches their own auth.uid().
alter table public.items enable row level security;
alter table public.logs enable row level security;
alter table public.diary enable row level security;
alter table public.user_overrides enable row level security;
alter table public.gym_logs enable row level security;

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
