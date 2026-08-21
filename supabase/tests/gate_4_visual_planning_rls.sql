begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@gate4.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner@gate4.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveller@gate4.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@gate4.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@gate4.test', '', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000041', 'Owner'), ('00000000-0000-0000-0000-000000000042', 'Planner'),
  ('00000000-0000-0000-0000-000000000043', 'Traveller'), ('00000000-0000-0000-0000-000000000044', 'Viewer'),
  ('00000000-0000-0000-0000-000000000045', 'Outsider');

insert into public.trips (id, owner_id, name, origin, start_date, end_date, date_precision, created_by)
values ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041', 'Japan 2027', 'Sydney', '2027-04-01', '2027-04-12', 'exact', '00000000-0000-0000-0000-000000000041');
insert into public.trip_members (trip_id, user_id, role) values
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041', 'owner'),
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042', 'planner'),
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000043', 'traveller'),
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000044', 'viewer');

select has_table('public', 'destinations', 'destinations table exists');
select has_table('public', 'plan_items', 'plan_items table exists');
select has_table('public', 'ideas', 'ideas table exists');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041","email":"owner@gate4.test","role":"authenticated"}';
select lives_ok($$insert into public.destinations (id, trip_id, name, start_date, end_date, sort_order) values ('41000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000041', 'Tokyo', '2027-04-02', '2027-04-05', 0)$$, 'owner adds a destination');
select lives_ok($$insert into public.destinations (id, trip_id, name, start_date, end_date, sort_order) values ('41000000-0000-0000-0000-000000000042', '40000000-0000-0000-0000-000000000041', 'Kyoto', '2027-04-05', '2027-04-09', 1)$$, 'owner adds the next destination');
select lives_ok($$insert into public.plan_items (id, trip_id, item_type, title, destination_id, item_date, end_date, status) values ('42000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000041', 'stay', 'Tokyo stay', '41000000-0000-0000-0000-000000000041', '2027-04-02', '2027-04-05', 'booked')$$, 'owner adds a stay spanning nights');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000042","email":"planner@gate4.test","role":"authenticated"}';
select lives_ok($$insert into public.plan_items (id, trip_id, item_type, title, destination_id, end_destination_id, item_date, status) values ('42000000-0000-0000-0000-000000000042', '40000000-0000-0000-0000-000000000041', 'transport', 'Train to Kyoto', '41000000-0000-0000-0000-000000000041', '41000000-0000-0000-0000-000000000042', '2027-04-05', 'needs_checking')$$, 'planner adds connecting transport');
select results_eq($$update public.destinations set name = 'Tokyo city' where id = '41000000-0000-0000-0000-000000000041' returning name$$, $$values ('Tokyo city'::text)$$, 'planner updates canonical destination data');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000043","email":"traveller@gate4.test","role":"authenticated"}';
select ok(private.can_plan_trip('40000000-0000-0000-0000-000000000041'), 'traveller can contribute to planning');
select lives_ok($$insert into public.ideas (id, trip_id, destination_id, title, category) values ('43000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000041', '41000000-0000-0000-0000-000000000042', 'Tea ceremony', 'culture')$$, 'traveller saves an unscheduled idea');
select lives_ok($$select public.schedule_trip_idea('43000000-0000-0000-0000-000000000041', '41000000-0000-0000-0000-000000000042', '2027-04-07')$$, 'traveller schedules an idea atomically');
select results_eq($$select status from public.ideas where id = '43000000-0000-0000-0000-000000000041'$$, $$values ('scheduled'::public.idea_status)$$, 'scheduled idea retains provenance');
select results_eq($$select title from public.plan_items where title = 'Tea ceremony'$$, $$values ('Tea ceremony'::text)$$, 'scheduling creates the itinerary item');
select throws_ok($$select public.schedule_trip_idea('43000000-0000-0000-0000-000000000041', '41000000-0000-0000-0000-000000000042', '2027-04-07')$$, 'P0001', 'Idea is not available', 'an idea cannot be scheduled twice');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000044","email":"viewer@gate4.test","role":"authenticated"}';
select results_eq($$select name from public.destinations order by sort_order$$, $$values ('Tokyo city'::text), ('Kyoto'::text)$$, 'viewer sees the shared journey');
select throws_ok(
  $$insert into public.ideas (trip_id, title, category) values ('40000000-0000-0000-0000-000000000041', 'Forbidden idea', 'other') returning id$$,
  '42501', 'new row violates row-level security policy for table "ideas"', 'viewer cannot create planning data'
);
select is_empty($$update public.destinations set name = 'Forbidden' where id = '41000000-0000-0000-0000-000000000041' returning id$$, 'viewer cannot edit planning data');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000045","email":"outsider@gate4.test","role":"authenticated"}';
select is_empty('select * from public.destinations', 'outsider cannot discover destinations');
select is_empty('select * from public.plan_items', 'outsider cannot discover plan items');
select is_empty('select * from public.ideas', 'outsider cannot discover ideas');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041","email":"owner@gate4.test","role":"authenticated"}';
select lives_ok($$insert into public.ideas (id, trip_id, destination_id, title, category) values ('43000000-0000-0000-0000-000000000042', '40000000-0000-0000-0000-000000000041', '41000000-0000-0000-0000-000000000041', 'Tokyo possibility', 'place')$$, 'owner adds destination-linked idea');
select results_eq($$delete from public.destinations where id = '41000000-0000-0000-0000-000000000041' returning id$$, $$values ('41000000-0000-0000-0000-000000000041'::uuid)$$, 'owner removes a destination after impact review');
select is_empty($$select id from public.plan_items where id in ('42000000-0000-0000-0000-000000000041', '42000000-0000-0000-0000-000000000042')$$, 'linked stay and transport are not orphaned');
select results_eq($$select destination_id from public.ideas where id = '43000000-0000-0000-0000-000000000042'$$, $$values (null::uuid)$$, 'unscheduled idea survives with destination cleared');

select * from finish();
rollback;
