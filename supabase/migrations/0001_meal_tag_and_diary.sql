-- Run once in the SQL Editor of a project that already has the original
-- schema.sql applied. Purely additive — doesn't touch existing rows.

alter table events add column if not exists meal_tag text;

create table if not exists diary (
  identity text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_identity text not null,
  date date not null,
  content text,
  title text,
  updated_at bigint,
  primary key (user_id, identity)
);

alter table diary enable row level security;

create policy "own diary" on diary for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
