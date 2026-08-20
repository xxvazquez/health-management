-- ============================================================================
-- RLS / per-user ownership isolation tests for Lauva's Supabase schema.
-- ============================================================================
-- Run against a `supabase/postgres` container (it ships with the `auth`
-- schema and `auth.uid()` pre-defined, unlike a plain `postgres` image)
-- AFTER applying supabase/schema.sql — see .github/workflows/check.yml's
-- "rls" job for the exact sequence. Never run this against a real project
-- (it creates fake auth.users rows) — that's the whole reason it lives here
-- as an automated CI check instead of a query to paste into the dashboard.
--
-- Every table in this schema uses the identical policy shape:
--   using (auth.uid() = user_id) with check (auth.uid() = user_id)
-- so this suite asks the same four questions of every one of them: can a
-- user see/update/delete another user's rows (no), can `user_id` be
-- spoofed on insert or changed on update (no), and — for the tables with a
-- composite foreign key into another user-owned table — can that FK be
-- used to smuggle a reference across the user boundary (no).
--
-- `auth.uid()` reads the caller's identity from the `request.jwt.claims`
-- session setting, the same one PostgREST populates from a real JWT in
-- production. Switching "user" here means pointing that setting at a
-- different `sub`, which is exactly what two different signed-in users
-- hitting the same Supabase project looks like from the database's side.
--
-- Wrapped in one transaction, rolled back at the end — running this
-- against a long-lived database never leaves the fake test users or any
-- test row behind.

begin;

-- ---- Test harness -----------------------------------------------------

create or replace function public.test_assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if not condition then
    raise exception 'RLS TEST FAILED: %', message;
  end if;
  raise notice 'ok - %', message;
end;
$$;

-- Switches the current session's effective identity, the way PostgREST
-- would for a real request carrying that user's JWT.
create or replace function public.test_switch_user(target_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', target_user_id, 'role', 'authenticated')::text, true);
$$;

-- Asserts that a statement is rejected specifically by an RLS policy
-- (insufficient_privilege), a foreign key violation, or a check
-- constraint — every "must be rejected" case uses this. Deliberately
-- narrow rather than catching every exception: a typo or an unrelated
-- bug in the statement under test (e.g. a bad column name) must fail
-- loudly here, not get silently counted as "correctly rejected".
create or replace function public.test_assert_raises(sql_text text, message text) returns void
language plpgsql as $$
begin
  execute sql_text;
  raise exception 'RLS TEST FAILED: % (expected an error, but the statement succeeded)', message;
exception
  when insufficient_privilege or foreign_key_violation or check_violation then
    raise notice 'ok - % (correctly rejected: %)', message, sqlerrm;
end;
$$;

set local role postgres;

-- Two fake users — RLS only needs matching auth.users rows for the foreign
-- keys to resolve, not a real signup/GoTrue flow.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.com')
on conflict (id) do nothing;

-- A hosted Supabase project grants `authenticated` table-level DML on
-- every public table automatically; a bare postgres/supabase-postgres
-- image run in CI may not have that provisioning step, so it's done
-- explicitly here. This is a privilege floor underneath RLS, not a
-- replacement for it — every one of these tables is still scoped by its
-- own policy, which is what the rest of this file actually tests.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.categories, public.food_items, public.supplement_items, public.habit_items, public.symptom_items,
  public.food_logs, public.supplement_logs, public.habit_logs, public.symptom_logs,
  public.food_diary, public.supplement_diary, public.habit_diary, public.symptom_diary,
  public.stool_logs, public.gym_logs, public.push_subscriptions
  to authenticated;

set local role authenticated;
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  auth.uid() = '11111111-1111-1111-1111-111111111111'::uuid,
  'harness: auth.uid() reflects the session claim (sanity check before trusting anything below)'
);

-- ============================================================================
-- categories
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.categories (id, item_type, name) values ('a0000000-0000-0000-0000-00000000000a', 'food', 'A''s Category');
insert into public.categories (id, item_type, name) values ('c0000000-0000-0000-0000-00000000000c', 'food', 'A''s Second Category');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.categories where id = 'a0000000-0000-0000-0000-00000000000a') = 0,
  'categories: user B cannot SELECT user A''s category'
);
update public.categories set name = 'hijacked' where id = 'a0000000-0000-0000-0000-00000000000a';
delete from public.categories where id = 'a0000000-0000-0000-0000-00000000000a';

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select name from public.categories where id = 'a0000000-0000-0000-0000-00000000000a') = 'A''s Category',
  'categories: user A''s row survives user B''s UPDATE and DELETE attempts, untouched'
);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert_raises(
  $sql$insert into public.categories (id, user_id, item_type, name)
       values ('b0000000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'food', 'Spoofed')$sql$,
  'categories: user_id cannot be spoofed to another user on INSERT'
);

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert_raises(
  $sql$update public.categories set user_id = '22222222-2222-2222-2222-222222222222'
       where id = 'c0000000-0000-0000-0000-00000000000c'$sql$,
  'categories: user_id cannot be reassigned to another user on UPDATE'
);

-- ============================================================================
-- food_items / supplement_items / habit_items / symptom_items
-- ============================================================================
-- Same shape, same tests, four times over — one composite FK into
-- categories(user_id, id, item_type) each. B gets their own category of
-- each type below, used for the item_type-mismatch check.

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.food_items (id, name, category_id) values ('f0000000-0000-0000-0000-00000000000f', 'A''s Apple', 'a0000000-0000-0000-0000-00000000000a');
insert into public.categories (id, item_type, name) values ('10000000-0000-0000-0000-000000000001', 'supplement', 'A''s Supp Category');
insert into public.supplement_items (id, name, category_id) values ('20000000-0000-0000-0000-000000000002', 'A''s Vitamin D', '10000000-0000-0000-0000-000000000001');
insert into public.categories (id, item_type, name) values ('30000000-0000-0000-0000-000000000003', 'habit', 'A''s Habit Category');
insert into public.habit_items (id, name, category_id) values ('40000000-0000-0000-0000-000000000004', 'A''s Walk', '30000000-0000-0000-0000-000000000003');
insert into public.categories (id, item_type, name) values ('50000000-0000-0000-0000-000000000005', 'symptom', 'A''s Symptom Category');
insert into public.symptom_items (id, name, category_id) values ('60000000-0000-0000-0000-000000000006', 'A''s Headache', '50000000-0000-0000-0000-000000000005');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
insert into public.categories (id, item_type, name) values ('e0000000-0000-0000-0000-00000000000e', 'food', 'B''s Food Category');
insert into public.categories (id, item_type, name) values ('70000000-0000-0000-0000-000000000007', 'supplement', 'B''s Supp Category');
insert into public.categories (id, item_type, name) values ('80000000-0000-0000-0000-000000000008', 'habit', 'B''s Habit Category');
insert into public.categories (id, item_type, name) values ('90000000-0000-0000-0000-000000000009', 'symptom', 'B''s Symptom Category');

select public.test_assert(
  (select count(*) from public.food_items where id = 'f0000000-0000-0000-0000-00000000000f') = 0,
  'food_items: user B cannot SELECT user A''s item'
);
select public.test_assert(
  (select count(*) from public.supplement_items where id = '20000000-0000-0000-0000-000000000002') = 0,
  'supplement_items: user B cannot SELECT user A''s item'
);
select public.test_assert(
  (select count(*) from public.habit_items where id = '40000000-0000-0000-0000-000000000004') = 0,
  'habit_items: user B cannot SELECT user A''s item'
);
select public.test_assert(
  (select count(*) from public.symptom_items where id = '60000000-0000-0000-0000-000000000006') = 0,
  'symptom_items: user B cannot SELECT user A''s item'
);

select public.test_assert_raises(
  $sql$insert into public.food_items (id, user_id, name, category_id)
       values ('d0000000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111', 'Spoofed', 'e0000000-0000-0000-0000-00000000000e')$sql$,
  'food_items: user_id cannot be spoofed on INSERT'
);

-- Cross-user composite FK: user B, inserting as themself, points a new
-- item at user A's category id. There's no (B, A''s-category-id, 'food')
-- row in categories, so this must fail as a foreign key violation.
select public.test_assert_raises(
  $sql$insert into public.food_items (id, name, category_id)
       values ('11100000-0000-0000-0000-000000000111', 'Cross-user category', 'a0000000-0000-0000-0000-00000000000a')$sql$,
  'food_items: a category_id belonging to another user is rejected by the composite FK'
);
select public.test_assert_raises(
  $sql$insert into public.supplement_items (id, name, category_id)
       values ('22200000-0000-0000-0000-000000000222', 'Cross-user category', '10000000-0000-0000-0000-000000000001')$sql$,
  'supplement_items: a category_id belonging to another user is rejected by the composite FK'
);

-- item_type boundary: even user B's OWN category can't be referenced if
-- it's filed under a different item_type — the FK carries item_type
-- specifically so a supplement item structurally can't reference a habit
-- category, independent of RLS.
select public.test_assert_raises(
  $sql$insert into public.food_items (id, name, category_id)
       values ('33300000-0000-0000-0000-000000000333', 'Wrong type', '80000000-0000-0000-0000-000000000008')$sql$,
  'food_items: a same-user category of the wrong item_type (habit, not food) is rejected'
);

-- ============================================================================
-- food_logs / supplement_logs / habit_logs / symptom_logs
-- ============================================================================
-- Same shape, one composite FK into the matching items table each.

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.food_logs (id, item_id, date, value) values ('l1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 1);
insert into public.supplement_logs (id, item_id, date, value) values ('l2000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2026-01-01', 1);
insert into public.habit_logs (id, item_id, date, value) values ('l3000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', '2026-01-01', 1);
insert into public.symptom_logs (id, item_id, date, value) values ('l4000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000006', '2026-01-01', 1);
insert into public.food_items (id, name, category_id) values ('aa000000-0000-0000-0000-0000000000aa', 'A''s second item', 'a0000000-0000-0000-0000-00000000000a');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.food_logs where id = 'l1000000-0000-0000-0000-000000000001') = 0,
  'food_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.supplement_logs where id = 'l2000000-0000-0000-0000-000000000002') = 0,
  'supplement_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.habit_logs where id = 'l3000000-0000-0000-0000-000000000003') = 0,
  'habit_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.symptom_logs where id = 'l4000000-0000-0000-0000-000000000004') = 0,
  'symptom_logs: user B cannot SELECT user A''s log'
);

update public.food_logs set value = 999 where id = 'l1000000-0000-0000-0000-000000000001';
delete from public.food_logs where id = 'l1000000-0000-0000-0000-000000000001';
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select value from public.food_logs where id = 'l1000000-0000-0000-0000-000000000001') = 1,
  'food_logs: user A''s log survives user B''s UPDATE and DELETE attempts, untouched'
);

-- Cross-user item_id FK: user B has no food_items row at all yet, so
-- referencing user A's item id (even with B's own user_id on the log
-- itself) must fail — there's no (B, A''s-item-id) row in food_items.
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert_raises(
  $sql$insert into public.food_logs (id, item_id, date, value)
       values ('bb000000-0000-0000-0000-0000000000bb', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 1)$sql$,
  'food_logs: an item_id belonging to another user is rejected by the composite FK'
);
select public.test_assert_raises(
  $sql$insert into public.food_logs (id, user_id, item_id, date, value)
       values ('cc000000-0000-0000-0000-0000000000cc', '11111111-1111-1111-1111-111111111111', 'aa000000-0000-0000-0000-0000000000aa', '2026-01-01', 1)$sql$,
  'food_logs: user_id cannot be spoofed on INSERT'
);

-- ============================================================================
-- food_diary / supplement_diary / habit_diary / symptom_diary
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.food_diary (id, item_id, date, content) values ('dd000000-0000-0000-0000-0000000000dd', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 'A''s private note');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.food_diary where id = 'dd000000-0000-0000-0000-0000000000dd') = 0,
  'food_diary: user B cannot SELECT user A''s diary entry'
);
select public.test_assert_raises(
  $sql$insert into public.food_diary (id, item_id, date, content)
       values ('ee000000-0000-0000-0000-0000000000ee', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 'peeking')$sql$,
  'food_diary: an item_id belonging to another user is rejected by the composite FK'
);

-- ============================================================================
-- stool_logs (no item/category — standalone, one row per bowel movement)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.stool_logs (id, date, bristol_scores) values ('55500000-0000-0000-0000-000000000555', '2026-01-01', array[4]::smallint[]);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.stool_logs where id = '55500000-0000-0000-0000-000000000555') = 0,
  'stool_logs: user B cannot SELECT user A''s entry'
);
select public.test_assert_raises(
  $sql$insert into public.stool_logs (id, user_id, date, bristol_scores)
       values ('66600000-0000-0000-0000-000000000666', '11111111-1111-1111-1111-111111111111', '2026-01-01', array[4]::smallint[])$sql$,
  'stool_logs: user_id cannot be spoofed on INSERT'
);

-- ============================================================================
-- gym_logs (no item/category — standalone)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.gym_logs (id, date, exercise, weight_kg) values ('77700000-0000-0000-0000-000000000777', '2026-01-01', 'Squat', 60);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.gym_logs where id = '77700000-0000-0000-0000-000000000777') = 0,
  'gym_logs: user B cannot SELECT user A''s lift'
);
select public.test_assert_raises(
  $sql$insert into public.gym_logs (id, user_id, date, exercise, weight_kg)
       values ('88800000-0000-0000-0000-000000000888', '11111111-1111-1111-1111-111111111111', '2026-01-01', 'Squat', 999)$sql$,
  'gym_logs: user_id cannot be spoofed on INSERT'
);

-- ============================================================================
-- push_subscriptions (PK is user_id itself — one row per user)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, timezone)
values ('11111111-1111-1111-1111-111111111111', 'https://push.example/a', 'key-a', 'auth-a', 'Europe/Warsaw');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111') = 0,
  'push_subscriptions: user B cannot SELECT user A''s subscription'
);
-- B cannot "steal" A's row by rewriting its primary key to their own id.
update public.push_subscriptions set user_id = '22222222-2222-2222-2222-222222222222'
  where user_id = '11111111-1111-1111-1111-111111111111';
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select count(*) from public.push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'push_subscriptions: user A''s row survives user B''s attempt to reassign it, untouched'
);
select public.test_assert_raises(
  $sql$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, timezone)
       values ('22222222-2222-2222-2222-222222222222', 'https://push.example/spoofed', 'k', 'a', 'UTC')$sql$,
  'push_subscriptions: user_id cannot be spoofed on INSERT (attempted as A, targeting B''s row)'
);

do $$ begin raise notice '=== all RLS tests passed ==='; end $$;

rollback;
