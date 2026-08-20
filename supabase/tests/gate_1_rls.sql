begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@example.test', '', now(), now(), now());
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.trips (id, owner_id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Owner trip', '00000000-0000-0000-0000-000000000001');
insert into public.trip_members (trip_id, user_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq('select name from public.trips', $$values ('Owner trip'::text)$$, 'owner can read own trip');
select ok(private.is_trip_member('10000000-0000-0000-0000-000000000001'), 'owner is an active member');
select ok(private.can_edit_trip('10000000-0000-0000-0000-000000000001'), 'owner can edit');
select ok(private.is_trip_owner('10000000-0000-0000-0000-000000000001'), 'owner has owner authority');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is_empty('select * from public.trips', 'outsider cannot read trip');
select isnt(private.is_trip_member('10000000-0000-0000-0000-000000000001'), true, 'outsider is not a member');
select throws_ok(
  $$insert into public.trip_members (trip_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'owner')$$,
  '42501', null, 'outsider cannot self-assign owner'
);
select results_eq(
  $$delete from public.trips where id = '10000000-0000-0000-0000-000000000001' returning id$$,
  $$select null::uuid where false$$,
  'outsider cannot delete trip'
);

select * from finish();
rollback;
