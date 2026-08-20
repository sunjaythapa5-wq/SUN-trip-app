begin;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@gate3.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner@gate3.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@gate3.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@gate3.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitee@gate3.test', '', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000011', 'Owner'),
  ('00000000-0000-0000-0000-000000000012', 'Planner'),
  ('00000000-0000-0000-0000-000000000013', 'Viewer'),
  ('00000000-0000-0000-0000-000000000014', 'Outsider');

insert into public.trips (id, owner_id, name, origin, start_date, end_date, date_precision, created_by)
values ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'Italy 2027', 'Sydney', '2027-05-01', '2027-05-20', 'exact', '00000000-0000-0000-0000-000000000011');

insert into public.trip_members (trip_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'owner'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'planner'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000013', 'viewer');

insert into public.trip_invites (id, trip_id, email, token_hash, role, invited_by, expires_at) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', 'invitee@gate3.test', encode(extensions.digest('valid-invite-token-000000000000001', 'sha256'), 'hex'), 'traveller', '00000000-0000-0000-0000-000000000011', now() + interval '1 day'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011', 'invitee@gate3.test', encode(extensions.digest('expired-invite-token-0000000000001', 'sha256'), 'hex'), 'viewer', '00000000-0000-0000-0000-000000000011', now() - interval '1 day'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000011', 'other@gate3.test', encode(extensions.digest('wrong-email-token-0000000000000001', 'sha256'), 'hex'), 'viewer', '00000000-0000-0000-0000-000000000011', now() + interval '1 day');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","email":"owner@gate3.test","role":"authenticated"}';
select results_eq('select name from public.trips', $$values ('Italy 2027'::text)$$, 'owner reads canonical trip');
select ok(private.can_edit_trip('10000000-0000-0000-0000-000000000011'), 'owner can edit');
select lives_ok($$select * from public.create_trip_invite('10000000-0000-0000-0000-000000000011', 'new@gate3.test', 'traveller')$$, 'owner can create an email-bound invite');
select throws_ok(
  $$select * from public.create_trip_invite('10000000-0000-0000-0000-000000000011', null, 'traveller')$$,
  'P0001', 'Invalid invitation email', 'invite email is required at the database boundary'
);
select throws_ok(
  $$select * from public.create_trip_invite('10000000-0000-0000-0000-000000000011', 'owner-role@gate3.test', 'owner')$$,
  'P0001', 'Invalid invitation role', 'owner role cannot be granted by invitation'
);
select results_eq(
  $$update public.trip_members set role = 'traveller' where trip_id = '10000000-0000-0000-0000-000000000011' and user_id = '00000000-0000-0000-0000-000000000013' returning role$$,
  $$values ('traveller'::public.trip_role)$$,
  'owner can change a non-owner role'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000012","email":"planner@gate3.test","role":"authenticated"}';
select ok(private.can_edit_trip('10000000-0000-0000-0000-000000000011'), 'planner can edit');
select results_eq(
  $$update public.trips set name = 'Italy & Switzerland 2027' where id = '10000000-0000-0000-0000-000000000011' returning name$$,
  $$values ('Italy & Switzerland 2027'::text)$$,
  'planner updates shared trip metadata'
);
select lives_ok($$select * from public.create_trip_invite('10000000-0000-0000-0000-000000000011', 'planner-invite@gate3.test', 'viewer')$$, 'planner can invite');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","email":"owner@gate3.test","role":"authenticated"}';
select results_eq('select name from public.trips', $$values ('Italy & Switzerland 2027'::text)$$, 'owner sees the same canonical update');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000013","email":"viewer@gate3.test","role":"authenticated"}';
select isnt(private.can_edit_trip('10000000-0000-0000-0000-000000000011'), true, 'traveller cannot edit');
select is_empty(
  $$update public.trips set name = 'Forbidden change' where id = '10000000-0000-0000-0000-000000000011' returning id$$,
  'read-only member cannot update trip'
);
select is_empty(
  $$update public.trip_members set role = 'owner' where trip_id = '10000000-0000-0000-0000-000000000011' and user_id = '00000000-0000-0000-0000-000000000013' returning user_id$$,
  'member cannot elevate their own role'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000014","email":"outsider@gate3.test","role":"authenticated"}';
select is_empty('select * from public.trips', 'outsider cannot discover the trip');
select throws_ok(
  $$select * from public.create_trip_invite('10000000-0000-0000-0000-000000000011', 'attacker@gate3.test', 'viewer')$$,
  'P0001', 'Permission denied', 'outsider cannot invite'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000015","email":"invitee@gate3.test","role":"authenticated"}';
select results_eq(
  $$select public.accept_trip_invite('valid-invite-token-000000000000001')$$,
  $$values ('10000000-0000-0000-0000-000000000011'::uuid)$$,
  'email-matched invitee accepts once'
);
select results_eq('select name from public.trips', $$values ('Italy & Switzerland 2027'::text)$$, 'accepted invitee gains access');
select throws_ok(
  $$select public.accept_trip_invite('valid-invite-token-000000000000001')$$,
  'P0001', 'Invitation is invalid or expired', 'accepted invite cannot be reused'
);
select throws_ok(
  $$select public.accept_trip_invite('expired-invite-token-0000000000001')$$,
  'P0001', 'Invitation is invalid or expired', 'expired invite cannot be accepted'
);
select throws_ok(
  $$select public.accept_trip_invite('wrong-email-token-0000000000000001')$$,
  'P0001', 'Invitation belongs to another email address', 'email mismatch is rejected'
);
select lives_ok($$select public.leave_trip('10000000-0000-0000-0000-000000000011')$$, 'non-owner can leave');
select is_empty('select * from public.trips', 'leaving immediately removes trip access');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000011","email":"owner@gate3.test","role":"authenticated"}';
select throws_ok(
  $$select public.leave_trip('10000000-0000-0000-0000-000000000011')$$,
  'P0001', 'The owner must delete the trip instead', 'owner cannot leave'
);
select results_eq(
  $$update public.trip_members set status = 'removed', removed_at = now() where trip_id = '10000000-0000-0000-0000-000000000011' and user_id = '00000000-0000-0000-0000-000000000013' returning user_id$$,
  $$values ('00000000-0000-0000-0000-000000000013'::uuid)$$,
  'owner can remove a member'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000013","email":"viewer@gate3.test","role":"authenticated"}';
select is_empty('select * from public.trips', 'removed member loses access');

select * from finish();
rollback;
