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

-- `if not condition` is a trap here: when condition is NULL (not TRUE,
-- not FALSE — e.g. auth.uid() itself returning NULL), `not NULL` is NULL,
-- and PL/pgSQL treats a NULL IF-condition the same as FALSE — skipping the
-- raise and silently falling through to "ok". `is not true` has no such
-- gap: it's TRUE for both FALSE and NULL, never NULL itself.
create or replace function public.test_assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if condition is not true then
    raise exception 'RLS TEST FAILED: %', message;
  end if;
  raise notice 'ok - %', message;
end;
$$;

-- Switches the current session's effective identity, the way PostgREST
-- would for a real request carrying that user's JWT. Sets both the JSON
-- claims blob and the flat per-claim settings — different Supabase
-- postgres image builds have read auth.uid() from one or the other, and
-- setting both is cheap insurance against relying on an implementation
-- detail this suite can't directly inspect.
create or replace function public.test_switch_user(target_user_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', target_user_id, 'role', 'authenticated')::text, true);
  select set_config('request.jwt.claim.sub', target_user_id::text, true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
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

-- Same idea as test_assert_raises, but for redeem_partner_invite's plain
-- `raise exception` business-rule checks (already-redeemed, already-linked,
-- etc.) — those carry the generic P0001 SQLSTATE, not one of the specific
-- ones test_assert_raises narrows to, so they need their own broad catch
-- rather than being lumped in with (and potentially masking a gap in) the
-- RLS/FK/check-constraint-specific assertion above.
-- The "unexpectedly succeeded" failure below is itself raised from inside
-- this same block, so a bare `when others` would catch and silently
-- swallow it too, same as every other exception — reporting a bug (the
-- statement wrongly succeeding) as "ok". Tagging it with a sentinel
-- errcode and re-raising when that specific code is seen keeps it from
-- ever being mistaken for the business-rule rejection this is meant to
-- confirm.
create or replace function public.test_assert_raises_any(sql_text text, message text) returns void
language plpgsql as $$
begin
  execute sql_text;
  raise exception 'RLS TEST FAILED: % (expected an error, but the statement succeeded)', message using errcode = '99999';
exception
  when others then
    if sqlstate = '99999' then
      raise;
    end if;
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
  public.categories, public.food_items, public.supplement_items, public.habit_items, public.symptom_items, public.workout_items,
  public.food_logs, public.supplement_logs, public.habit_logs, public.symptom_logs,
  public.food_diary, public.supplement_diary, public.habit_diary, public.symptom_diary, public.workout_diary,
  public.stool_logs, public.workout_logs, public.period_logs, public.push_subscriptions,
  public.partner_invites, public.partner_links, public.notes,
  public.doctor_specialties, public.doctors, public.doctor_appointments, public.doctor_appointment_tasks
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

-- user_id is passed explicitly on every "own row" insert below, matching
-- how the app itself always writes (see src/lib/supabase/sync.ts's *AndSync
-- functions) — never relying on the column's `default auth.uid()` to fill
-- it in.
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.categories (id, user_id, item_type, name) values ('a0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'food', 'A''s Category');
insert into public.categories (id, user_id, item_type, name) values ('c0000000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111', 'food', 'A''s Second Category');

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
insert into public.food_items (id, user_id, name, category_id) values ('f0000000-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111', 'A''s Apple', 'a0000000-0000-0000-0000-00000000000a');
insert into public.categories (id, user_id, item_type, name) values ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'supplement', 'A''s Supp Category');
insert into public.supplement_items (id, user_id, name, category_id) values ('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A''s Vitamin D', '10000000-0000-0000-0000-000000000001');
insert into public.categories (id, user_id, item_type, name) values ('30000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'habit', 'A''s Habit Category');
insert into public.habit_items (id, user_id, name, category_id) values ('40000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'A''s Walk', '30000000-0000-0000-0000-000000000003');
insert into public.categories (id, user_id, item_type, name) values ('50000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'symptom', 'A''s Symptom Category');
insert into public.symptom_items (id, user_id, name, category_id) values ('60000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'A''s Headache', '50000000-0000-0000-0000-000000000005');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
insert into public.categories (id, user_id, item_type, name) values ('e0000000-0000-0000-0000-00000000000e', '22222222-2222-2222-2222-222222222222', 'food', 'B''s Food Category');
insert into public.categories (id, user_id, item_type, name) values ('70000000-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'supplement', 'B''s Supp Category');
insert into public.categories (id, user_id, item_type, name) values ('80000000-0000-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'habit', 'B''s Habit Category');
insert into public.categories (id, user_id, item_type, name) values ('90000000-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'symptom', 'B''s Symptom Category');

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

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert_raises(
  $sql$update public.food_items set user_id = '22222222-2222-2222-2222-222222222222'
       where id = 'f0000000-0000-0000-0000-00000000000f'$sql$,
  'food_items: user_id cannot be reassigned to another user on UPDATE (owner giving away their own row)'
);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');

-- Cross-user composite FK: user B, inserting as themself, points a new
-- item at user A's category id. There's no (B, A''s-category-id, 'food')
-- row in categories, so this must fail as a foreign key violation.
-- user_id is explicit here too (B's own id, correctly passing RLS) so each
-- of these fails for exactly the reason claimed — a composite FK violation
-- — rather than accidentally getting masked by an unrelated RLS rejection
-- (test_assert_raises accepts either as "correctly rejected", which would
-- silently hide the FK check not being exercised at all).
select public.test_assert_raises(
  $sql$insert into public.food_items (id, user_id, name, category_id)
       values ('11100000-0000-0000-0000-000000000111', '22222222-2222-2222-2222-222222222222', 'Cross-user category', 'a0000000-0000-0000-0000-00000000000a')$sql$,
  'food_items: a category_id belonging to another user is rejected by the composite FK'
);
select public.test_assert_raises(
  $sql$insert into public.supplement_items (id, user_id, name, category_id)
       values ('22200000-0000-0000-0000-000000000222', '22222222-2222-2222-2222-222222222222', 'Cross-user category', '10000000-0000-0000-0000-000000000001')$sql$,
  'supplement_items: a category_id belonging to another user is rejected by the composite FK'
);

-- item_type boundary: even user B's OWN category can't be referenced if
-- it's filed under a different item_type — the FK carries item_type
-- specifically so a supplement item structurally can't reference a habit
-- category, independent of RLS.
select public.test_assert_raises(
  $sql$insert into public.food_items (id, user_id, name, category_id)
       values ('33300000-0000-0000-0000-000000000333', '22222222-2222-2222-2222-222222222222', 'Wrong type', '80000000-0000-0000-0000-000000000008')$sql$,
  'food_items: a same-user category of the wrong item_type (habit, not food) is rejected'
);

-- ============================================================================
-- food_logs / supplement_logs / habit_logs / symptom_logs
-- ============================================================================
-- Same shape, one composite FK into the matching items table each.

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.food_logs (id, user_id, item_id, date, value) values ('01000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 1);
insert into public.supplement_logs (id, user_id, item_id, date, value) values ('02000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000002', '2026-01-01', 1);
insert into public.habit_logs (id, user_id, item_id, date, value) values ('03000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000004', '2026-01-01', 1);
insert into public.symptom_logs (id, user_id, item_id, date, value) values ('04000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000006', '2026-01-01', 1);
insert into public.food_items (id, user_id, name, category_id) values ('aa000000-0000-0000-0000-0000000000aa', '11111111-1111-1111-1111-111111111111', 'A''s second item', 'a0000000-0000-0000-0000-00000000000a');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.food_logs where id = '01000000-0000-0000-0000-000000000001') = 0,
  'food_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.supplement_logs where id = '02000000-0000-0000-0000-000000000002') = 0,
  'supplement_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.habit_logs where id = '03000000-0000-0000-0000-000000000003') = 0,
  'habit_logs: user B cannot SELECT user A''s log'
);
select public.test_assert(
  (select count(*) from public.symptom_logs where id = '04000000-0000-0000-0000-000000000004') = 0,
  'symptom_logs: user B cannot SELECT user A''s log'
);

update public.food_logs set value = 999 where id = '01000000-0000-0000-0000-000000000001';
delete from public.food_logs where id = '01000000-0000-0000-0000-000000000001';
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select value from public.food_logs where id = '01000000-0000-0000-0000-000000000001') = 1,
  'food_logs: user A''s log survives user B''s UPDATE and DELETE attempts, untouched'
);
select public.test_assert_raises(
  $sql$update public.food_logs set user_id = '22222222-2222-2222-2222-222222222222'
       where id = '01000000-0000-0000-0000-000000000001'$sql$,
  'food_logs: user_id cannot be reassigned to another user on UPDATE (owner giving away their own row)'
);

-- Cross-user item_id FK: user B has no food_items row at all yet, so
-- referencing user A's item id (even with B's own user_id on the log
-- itself) must fail — there's no (B, A''s-item-id) row in food_items.
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert_raises(
  $sql$insert into public.food_logs (id, user_id, item_id, date, value)
       values ('bb000000-0000-0000-0000-0000000000bb', '22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 1)$sql$,
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
insert into public.food_diary (id, user_id, item_id, date, content) values ('dd000000-0000-0000-0000-0000000000dd', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 'A''s private note');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.food_diary where id = 'dd000000-0000-0000-0000-0000000000dd') = 0,
  'food_diary: user B cannot SELECT user A''s diary entry'
);
select public.test_assert_raises(
  $sql$insert into public.food_diary (id, user_id, item_id, date, content)
       values ('ee000000-0000-0000-0000-0000000000ee', '22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000f', '2026-01-01', 'peeking')$sql$,
  'food_diary: an item_id belonging to another user is rejected by the composite FK'
);

-- ============================================================================
-- workout_items / workout_diary
-- ============================================================================
-- Same composite-FK shape as food_items/food_diary above — workout_items
-- is a real item type (name, category, archive state, unit), referenced by
-- both workout_diary (per-item-per-day note) and workout_logs (per-set weight,
-- tested further below) via the same (user_id, id) composite FK.

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.categories (id, user_id, item_type, name) values ('ab000000-0000-0000-0000-0000000000ab', '11111111-1111-1111-1111-111111111111', 'workout', 'A''s Workout Category');
insert into public.workout_items (id, user_id, name, category_id) values ('ac000000-0000-0000-0000-0000000000ac', '11111111-1111-1111-1111-111111111111', 'A''s Squat', 'ab000000-0000-0000-0000-0000000000ab');
insert into public.workout_diary (id, user_id, item_id, date, content) values ('ad000000-0000-0000-0000-0000000000ad', '11111111-1111-1111-1111-111111111111', 'ac000000-0000-0000-0000-0000000000ac', '2026-01-01', 'A''s private note');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
insert into public.categories (id, user_id, item_type, name) values ('ae000000-0000-0000-0000-0000000000ae', '22222222-2222-2222-2222-222222222222', 'workout', 'B''s Workout Category');
select public.test_assert(
  (select count(*) from public.workout_items where id = 'ac000000-0000-0000-0000-0000000000ac') = 0,
  'workout_items: user B cannot SELECT user A''s exercise'
);
select public.test_assert(
  (select count(*) from public.workout_diary where id = 'ad000000-0000-0000-0000-0000000000ad') = 0,
  'workout_diary: user B cannot SELECT user A''s note'
);

select public.test_assert_raises(
  $sql$insert into public.workout_items (id, user_id, name, category_id)
       values ('af000000-0000-0000-0000-0000000000af', '11111111-1111-1111-1111-111111111111', 'Spoofed', 'ae000000-0000-0000-0000-0000000000ae')$sql$,
  'workout_items: user_id cannot be spoofed on INSERT'
);
select public.test_assert_raises(
  $sql$insert into public.workout_items (id, user_id, name, category_id)
       values ('b0000000-0000-0000-0000-0000000000b0', '22222222-2222-2222-2222-222222222222', 'Cross-user category', 'ab000000-0000-0000-0000-0000000000ab')$sql$,
  'workout_items: a category_id belonging to another user is rejected by the composite FK'
);
select public.test_assert_raises(
  $sql$insert into public.workout_diary (id, user_id, item_id, date, content)
       values ('b1000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'ac000000-0000-0000-0000-0000000000ac', '2026-01-01', 'peeking')$sql$,
  'workout_diary: an item_id belonging to another user is rejected by the composite FK'
);

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert_raises(
  $sql$update public.workout_items set user_id = '22222222-2222-2222-2222-222222222222'
       where id = 'ac000000-0000-0000-0000-0000000000ac'$sql$,
  'workout_items: user_id cannot be reassigned to another user on UPDATE (owner giving away their own row)'
);

-- ============================================================================
-- stool_logs (no item/category — standalone, one row per bowel movement)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.stool_logs (id, user_id, date, bristol_scores) values ('55500000-0000-0000-0000-000000000555', '11111111-1111-1111-1111-111111111111', '2026-01-01', array[4]::smallint[]);

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
-- workout_logs (references workout_items via a composite FK, like the other
-- *_logs tables — no diary/item dimension of its own beyond that)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.workout_logs (id, user_id, item_id, date, weight_kg) values ('77700000-0000-0000-0000-000000000777', '11111111-1111-1111-1111-111111111111', 'ac000000-0000-0000-0000-0000000000ac', '2026-01-01', 60);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.workout_logs where id = '77700000-0000-0000-0000-000000000777') = 0,
  'workout_logs: user B cannot SELECT user A''s lift'
);
select public.test_assert_raises(
  $sql$insert into public.workout_logs (id, user_id, item_id, date, weight_kg)
       values ('88800000-0000-0000-0000-000000000888', '11111111-1111-1111-1111-111111111111', 'ac000000-0000-0000-0000-0000000000ac', '2026-01-01', 999)$sql$,
  'workout_logs: user_id cannot be spoofed on INSERT'
);
select public.test_assert_raises(
  $sql$insert into public.workout_logs (id, user_id, item_id, date, weight_kg)
       values ('89900000-0000-0000-0000-000000000899', '22222222-2222-2222-2222-222222222222', 'ac000000-0000-0000-0000-0000000000ac', '2026-01-01', 999)$sql$,
  'workout_logs: an item_id belonging to another user is rejected by the composite FK'
);

-- ============================================================================
-- period_logs (no item/category — standalone, one row per period day)
-- ============================================================================

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.period_logs (id, user_id, date, intensity) values ('99900000-0000-0000-0000-000000000999', '11111111-1111-1111-1111-111111111111', '2026-01-01', 'Medium');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.period_logs where id = '99900000-0000-0000-0000-000000000999') = 0,
  'period_logs: user B cannot SELECT user A''s entry'
);
select public.test_assert_raises(
  $sql$insert into public.period_logs (id, user_id, date, intensity)
       values ('99a00000-0000-0000-0000-00000000099a', '11111111-1111-1111-1111-111111111111', '2026-01-01', 'Medium')$sql$,
  'period_logs: user_id cannot be spoofed on INSERT'
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

-- ============================================================================
-- partner_invites / partner_links / redeem_partner_invite
-- ============================================================================
-- A third fake user, C, is introduced here — the notes tests below need
-- someone who is NOT A's partner to prove a note can't be sent to (or a
-- thread joined by) anyone outside the actual partner_links pairing.
-- Writing directly to auth.users needs the same privileged role the
-- original A/B insert used at the top of this file (`authenticated` has no
-- business inserting there at all, same as a real app never would) — the
-- session is still `authenticated` from the harness setup above, so this
-- switches out to postgres just for the insert and back immediately after.
set local role postgres;
insert into auth.users (id, email)
values ('33333333-3333-3333-3333-333333333333', 'user-c@example.com')
on conflict (id) do nothing;
set local role authenticated;

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.partner_invites (id, code, created_by) values ('c1000000-0000-0000-0000-0000000000c1', 'INVITE-AB', '11111111-1111-1111-1111-111111111111');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.partner_invites where id = 'c1000000-0000-0000-0000-0000000000c1') = 0,
  'partner_invites: user B cannot SELECT user A''s invite (only the creator can)'
);

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert_raises_any(
  $sql$select public.redeem_partner_invite('INVITE-AB')$sql$,
  'redeem_partner_invite: creator cannot redeem their own invite'
);

-- B redeems A's invite — creates the link.
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.redeem_partner_invite('INVITE-AB');
select public.test_assert(
  (select count(*) from public.partner_links where user_a_id = '11111111-1111-1111-1111-111111111111' and user_b_id = '22222222-2222-2222-2222-222222222222') = 1,
  'redeem_partner_invite: redeeming creates a partner_links row for A and B'
);

-- get_partner_email: A and B (now linked) can each see the other's email;
-- C (unrelated, and not yet linked to anyone) gets null.
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  public.get_partner_email() = 'user-b@example.com',
  'get_partner_email: A sees B''s email'
);
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  public.get_partner_email() = 'user-a@example.com',
  'get_partner_email: B sees A''s email'
);
select public.test_switch_user('33333333-3333-3333-3333-333333333333');
select public.test_assert(
  public.get_partner_email() is null,
  'get_partner_email: an unlinked user gets null, not A or B''s email'
);

-- The same code cannot be redeemed a second time.
select public.test_switch_user('33333333-3333-3333-3333-333333333333');
select public.test_assert_raises_any(
  $sql$select public.redeem_partner_invite('INVITE-AB')$sql$,
  'redeem_partner_invite: an already-redeemed code cannot be redeemed again'
);

select public.test_assert(
  (select count(*) from public.partner_links where user_a_id = '11111111-1111-1111-1111-111111111111') = 0,
  'partner_links: user C (not a participant) cannot SELECT A/B''s link'
);

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select count(*) from public.partner_links where user_a_id = '11111111-1111-1111-1111-111111111111') = 1,
  'partner_links: user A (participant) can SELECT the link'
);
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.partner_links where user_b_id = '22222222-2222-2222-2222-222222222222') = 1,
  'partner_links: user B (participant) can SELECT the link'
);

-- Someone already linked can't redeem a second invite.
select public.test_switch_user('33333333-3333-3333-3333-333333333333');
insert into public.partner_invites (id, code, created_by) values ('c2000000-0000-0000-0000-0000000000c2', 'INVITE-C', '33333333-3333-3333-3333-333333333333');
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert_raises_any(
  $sql$select public.redeem_partner_invite('INVITE-C')$sql$,
  'redeem_partner_invite: an already-linked user cannot redeem a second invite'
);

-- ============================================================================
-- notes
-- ============================================================================
-- A (linked to B) sends B a note.
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.notes (id, sender_id, recipient_id, category, subject, body)
values ('d1000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'note', 'Hi', 'A''s first note to B');

select public.test_switch_user('33333333-3333-3333-3333-333333333333');
select public.test_assert(
  (select count(*) from public.notes where id = 'd1000000-0000-0000-0000-0000000000d1') = 0,
  'notes: user C (not a participant) cannot SELECT A''s note to B'
);
select public.test_assert_raises(
  $sql$insert into public.notes (id, sender_id, recipient_id, category, body)
       values ('d2000000-0000-0000-0000-0000000000d2', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'note', 'C trying to message B, who is not C''s partner')$sql$,
  'notes: cannot send a note to someone who is not your linked partner'
);
select public.test_assert_raises(
  $sql$insert into public.notes (id, sender_id, recipient_id, category, body)
       values ('d3000000-0000-0000-0000-0000000000d3', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'note', 'Spoofed sender')$sql$,
  'notes: sender_id cannot be spoofed on INSERT (as C, claiming to be A)'
);

-- B replies — a reply's thread_root_id must point at a thread the sender
-- is actually part of.
select public.test_switch_user('22222222-2222-2222-2222-222222222222');
insert into public.notes (id, sender_id, recipient_id, thread_root_id, category, body)
values ('d4000000-0000-0000-0000-0000000000d4', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-0000000000d1', 'note', 'B''s reply');

select public.test_switch_user('33333333-3333-3333-3333-333333333333');
select public.test_assert_raises(
  $sql$insert into public.notes (id, sender_id, recipient_id, thread_root_id, category, body)
       values ('d5000000-0000-0000-0000-0000000000d5', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'd1000000-0000-0000-0000-0000000000d1', 'note', 'C trying to graft a reply onto A/B''s thread')$sql$,
  'notes: a reply cannot be grafted onto a thread the sender isn''t part of'
);

-- notes_touch_thread: B's reply above must have bumped the root's
-- last_message_at to the reply's own created_at.
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select last_message_at from public.notes where id = 'd1000000-0000-0000-0000-0000000000d1')
    = (select created_at from public.notes where id = 'd4000000-0000-0000-0000-0000000000d4'),
  'notes: a reply bumps its thread root''s last_message_at (notes_touch_thread)'
);

-- Read/favourite/archive: either participant can update their own side's
-- state on the root note.
update public.notes set sender_favourited = true, sender_read_at = now() where id = 'd1000000-0000-0000-0000-0000000000d1';
select public.test_assert(
  (select sender_favourited from public.notes where id = 'd1000000-0000-0000-0000-0000000000d1') = true,
  'notes: a participant can favourite/mark-read their own side of a note they''re part of'
);

-- Identity columns are locked after creation, even for a participant —
-- notes_lock_identity_columns raises a plain exception (not an RLS/FK/
-- check violation, since RLS itself allows this update: A stays sender_id
-- either way), hence test_assert_raises_any rather than test_assert_raises.
select public.test_assert_raises_any(
  $sql$update public.notes set recipient_id = '33333333-3333-3333-3333-333333333333'
       where id = 'd1000000-0000-0000-0000-0000000000d1'$sql$,
  'notes: recipient_id cannot be changed after creation, even by a participant (notes_lock_identity_columns)'
);

-- ============================================================================
-- doctors / doctor_specialties / doctor_appointments / doctor_appointment_tasks
-- ============================================================================
-- Plain owner-only tables, plus two composite FKs
-- (doctor_appointments -> doctors, doctor_appointment_tasks ->
-- doctor_appointments) that must not reach across the user boundary.
select public.test_switch_user('11111111-1111-1111-1111-111111111111');
insert into public.doctor_specialties (id, user_id, name) values ('e1000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111', 'Dentist');
insert into public.doctors (id, user_id, name, specialty, rating) values ('e2000000-0000-0000-0000-0000000000e2', '11111111-1111-1111-1111-111111111111', 'Dr A', 'Dentist', 1);
insert into public.doctor_appointments (id, user_id, doctor_id, specialty, appointment_at)
values ('e3000000-0000-0000-0000-0000000000e3', '11111111-1111-1111-1111-111111111111', 'e2000000-0000-0000-0000-0000000000e2', 'Dentist', now());
insert into public.doctor_appointment_tasks (id, user_id, appointment_id, description)
values ('e4000000-0000-0000-0000-0000000000e4', '11111111-1111-1111-1111-111111111111', 'e3000000-0000-0000-0000-0000000000e3', 'Book CT scan');

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert(
  (select count(*) from public.doctors where id = 'e2000000-0000-0000-0000-0000000000e2') = 0,
  'doctors: user B cannot SELECT user A''s doctor'
);
select public.test_assert(
  (select count(*) from public.doctor_appointments where id = 'e3000000-0000-0000-0000-0000000000e3') = 0,
  'doctor_appointments: user B cannot SELECT user A''s appointment'
);
update public.doctor_appointment_tasks set description = 'hijacked' where id = 'e4000000-0000-0000-0000-0000000000e4';
delete from public.doctor_appointment_tasks where id = 'e4000000-0000-0000-0000-0000000000e4';

select public.test_switch_user('11111111-1111-1111-1111-111111111111');
select public.test_assert(
  (select description from public.doctor_appointment_tasks where id = 'e4000000-0000-0000-0000-0000000000e4') = 'Book CT scan',
  'doctor_appointment_tasks: user A''s row survives user B''s UPDATE and DELETE attempts'
);

select public.test_switch_user('22222222-2222-2222-2222-222222222222');
select public.test_assert_raises(
  $sql$insert into public.doctors (id, user_id, name, specialty)
       values ('e5000000-0000-0000-0000-0000000000e5', '11111111-1111-1111-1111-111111111111', 'Spoofed', 'Dentist')$sql$,
  'doctors: user_id cannot be spoofed to another user on INSERT'
);
-- user_id is B's own (passes RLS) so this fails specifically on the
-- composite FK, not an unrelated RLS rejection.
select public.test_assert_raises(
  $sql$insert into public.doctor_appointments (id, user_id, doctor_id, specialty, appointment_at)
       values ('e6000000-0000-0000-0000-0000000000e6', '22222222-2222-2222-2222-222222222222', 'e2000000-0000-0000-0000-0000000000e2', 'Dentist', now())$sql$,
  'doctor_appointments: a doctor_id belonging to another user is rejected by the composite FK'
);
select public.test_assert_raises(
  $sql$insert into public.doctor_appointment_tasks (id, user_id, appointment_id, description)
       values ('e7000000-0000-0000-0000-0000000000e7', '22222222-2222-2222-2222-222222222222', 'e3000000-0000-0000-0000-0000000000e3', 'Cross-user task')$sql$,
  'doctor_appointment_tasks: an appointment_id belonging to another user is rejected by the composite FK'
);

do $$ begin raise notice '=== all RLS tests passed ==='; end $$;

rollback;
