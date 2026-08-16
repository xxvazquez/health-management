-- Signal Ledger / Log page — cloud sync schema.
--
-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL
-- Editor -> New query -> paste -> Run). Only what you log from the /log
-- page ever reaches these tables — imported historical data stays local.
--
-- Row Level Security means every policy below is scoped to auth.uid(), so
-- even though the anon key is public (baked into the deployed site's JS,
-- by Supabase's design), nobody can read or write a row unless they're
-- signed in as the account that owns it.

create table if not exists habits (
  identity text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  raw_name text not null,
  unit text,
  kind text,
  frequency text,
  is_removed boolean not null default false,
  created_date date,
  updated_at timestamptz not null default now(),
  primary key (user_id, identity)
);

create table if not exists events (
  identity text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_identity text not null,
  date date not null,
  value numeric,
  goal_value numeric,
  is_skipped boolean not null default false,
  updated_at bigint,
  primary key (user_id, identity)
);
create index if not exists events_habit_date_idx on events (user_id, habit_identity, date);

create table if not exists user_overrides (
  key text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  canonical_name text not null,
  item_type text not null,
  category text not null,
  subcategory text not null,
  primary key (user_id, key)
);

alter table habits enable row level security;
alter table events enable row level security;
alter table user_overrides enable row level security;

create policy "own habits" on habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own events" on events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own user_overrides" on user_overrides for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
