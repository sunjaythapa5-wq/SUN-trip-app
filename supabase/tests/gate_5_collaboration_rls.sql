begin;
select plan(34);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@gate5.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'planner@gate5.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'traveller@gate5.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@gate5.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@gate5.test', '', now(), now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000051', 'Owner'), ('00000000-0000-0000-0000-000000000052', 'Planner'),
  ('00000000-0000-0000-0000-000000000053', 'Traveller'), ('00000000-0000-0000-0000-000000000054', 'Viewer'),
  ('00000000-0000-0000-0000-000000000055', 'Outsider');
insert into public.trips (id, owner_id, name, origin, start_date, end_date, date_precision, created_by)
values ('50000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000051', 'Group trip', 'Sydney', '2027-05-01', '2027-05-10', 'exact', '00000000-0000-0000-0000-000000000051');
insert into public.trip_members (trip_id, user_id, role) values
  ('50000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000051', 'owner'),
  ('50000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000052', 'planner'),
  ('50000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000053', 'traveller'),
  ('50000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000054', 'viewer');
insert into public.destinations (id, trip_id, name, start_date, end_date, sort_order, created_by)
values ('51000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', 'Island', '2027-05-02', '2027-05-08', 0, '00000000-0000-0000-0000-000000000051');
insert into public.plan_items (id, trip_id, item_type, title, destination_id, item_date, sort_order, status, created_by)
values ('52000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', 'activity', 'Snorkelling', '51000000-0000-0000-0000-000000000051', '2027-05-04', 0, 'planned', '00000000-0000-0000-0000-000000000051');
insert into public.ideas (id, trip_id, destination_id, title, category, created_by)
values ('53000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', '51000000-0000-0000-0000-000000000051', 'Marine park', 'activity', '00000000-0000-0000-0000-000000000052');
insert into public.decisions (id, trip_id, question, created_by)
values ('54000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', 'What should we do?', '00000000-0000-0000-0000-000000000051');
insert into public.decision_options (id, decision_id, trip_id, label, sort_order) values
  ('55000000-0000-0000-0000-000000000051', '54000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', 'Beach', 0),
  ('55000000-0000-0000-0000-000000000052', '54000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000051', 'Market', 1);

select has_table('public', 'reactions', 'reactions table exists');
select has_table('public', 'item_participants', 'participation table exists');
select has_table('public', 'decisions', 'decisions table exists');
select has_table('public', 'decision_options', 'decision options table exists');
select has_table('public', 'decision_responses', 'decision responses table exists');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000051","email":"owner@gate5.test","role":"authenticated"}';
select lives_ok($$insert into public.reactions (trip_id, member_id, target_type, idea_id, preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051','idea','53000000-0000-0000-0000-000000000051','keen')$$, 'owner reacts');
select results_eq($$update public.reactions set preference='must_do' where member_id='00000000-0000-0000-0000-000000000051' returning preference$$, $$values ('must_do'::public.preference_value)$$, 'owner changes own reaction');
select lives_ok($$insert into public.item_participants (trip_id,plan_item_id,member_id,participation) values ('50000000-0000-0000-0000-000000000051','52000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051','going')$$, 'owner sets participation');
select lives_ok($$select public.create_trip_decision('50000000-0000-0000-0000-000000000051','Where should we eat?',array['Cafe','Market'])$$, 'owner creates a transactional decision');
select results_eq($$select count(*)::integer from public.decision_options where decision_id in (select id from public.decisions where question='Where should we eat?')$$, $$values (2)$$, 'decision creation includes all options');
select lives_ok($$insert into public.decision_responses (trip_id,decision_id,option_id,member_id) values ('50000000-0000-0000-0000-000000000051','54000000-0000-0000-0000-000000000051','55000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051')$$, 'owner responds');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000052","email":"planner@gate5.test","role":"authenticated"}';
select ok(private.can_manage_decisions('50000000-0000-0000-0000-000000000051'), 'planner can manage decisions');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000053","email":"traveller@gate5.test","role":"authenticated"}';
select ok(private.can_collaborate_trip('50000000-0000-0000-0000-000000000051'), 'traveller can collaborate');
select ok(not private.can_plan_trip('50000000-0000-0000-0000-000000000051'), 'traveller cannot structurally edit');
select lives_ok($$insert into public.reactions (trip_id,member_id,target_type,plan_item_id,preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000053','plan_item','52000000-0000-0000-0000-000000000051','maybe')$$, 'traveller reacts');
select lives_ok($$insert into public.item_participants (trip_id,plan_item_id,member_id,participation) values ('50000000-0000-0000-0000-000000000051','52000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000053','not_going')$$, 'traveller participation is independent');
select lives_ok($$insert into public.decision_responses (trip_id,decision_id,option_id,member_id) values ('50000000-0000-0000-0000-000000000051','54000000-0000-0000-0000-000000000051','55000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000053')$$, 'traveller responds');
select throws_ok($$insert into public.plan_items (trip_id,item_type,title,sort_order,created_by) values ('50000000-0000-0000-0000-000000000051','activity','Forbidden',1,'00000000-0000-0000-0000-000000000053')$$, '42501', 'new row violates row-level security policy for table "plan_items"', 'traveller cannot add structural data');
select throws_ok($$insert into public.reactions (trip_id,member_id,target_type,plan_item_id,preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000053','plan_item','52000000-0000-0000-0000-000000000051','keen')$$, '23505', null, 'duplicate active reaction is prevented');
select throws_ok($$insert into public.decision_responses (trip_id,decision_id,option_id,member_id) values ('50000000-0000-0000-0000-000000000051','54000000-0000-0000-0000-000000000051','55000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000053')$$, '23505', null, 'one response per member is enforced');
select throws_ok($$update public.decision_responses set option_id=gen_random_uuid() where decision_id='54000000-0000-0000-0000-000000000051' and member_id='00000000-0000-0000-0000-000000000053'$$, '23503', null, 'response option must belong to decision');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000051","email":"owner@gate5.test","role":"authenticated"}';
select lives_ok($$select public.resolve_trip_decision('54000000-0000-0000-0000-000000000051','55000000-0000-0000-0000-000000000051')$$, 'owner resolves deliberately');
select results_eq($$select count(*)::integer from public.plan_items$$, $$values (1)$$, 'resolution does not change the itinerary');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000054","email":"viewer@gate5.test","role":"authenticated"}';
select results_eq($$select count(*)::integer from public.reactions$$, $$values (2)$$, 'viewer sees collaboration');
select throws_ok($$insert into public.reactions (trip_id,member_id,target_type,idea_id,preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000054','idea','53000000-0000-0000-0000-000000000051','keen')$$, '42501', 'new row violates row-level security policy for table "reactions"', 'viewer cannot react');
select throws_ok($$insert into public.decision_responses (trip_id,decision_id,option_id,member_id) values ('50000000-0000-0000-0000-000000000051','54000000-0000-0000-0000-000000000051','55000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000054')$$, '42501', 'new row violates row-level security policy for table "decision_responses"', 'viewer cannot respond');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000055","email":"outsider@gate5.test","role":"authenticated"}';
select is_empty('select * from public.reactions', 'outsider cannot read reactions');
select is_empty('select * from public.decisions', 'outsider cannot read decisions');
select is_empty('select * from public.decision_responses', 'outsider cannot read responses');
select throws_ok($$insert into public.item_participants (trip_id,plan_item_id,member_id,participation) values ('50000000-0000-0000-0000-000000000051','52000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000055','going')$$, '42501', 'new row violates row-level security policy for table "item_participants"', 'outsider cannot participate');

reset role;
update public.trip_members set status='removed', removed_at=now() where trip_id='50000000-0000-0000-0000-000000000051' and user_id='00000000-0000-0000-0000-000000000053';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000053","email":"traveller@gate5.test","role":"authenticated"}';
select is_empty($$update public.reactions set preference='keen' where member_id='00000000-0000-0000-0000-000000000053' returning id$$, 'removed member cannot update');
select throws_ok($$insert into public.reactions (trip_id,member_id,target_type,idea_id,preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000053','idea','53000000-0000-0000-0000-000000000051','keen')$$, '42501', 'new row violates row-level security policy for table "reactions"', 'removed member cannot add');

reset role;
select throws_ok($$insert into public.reactions (trip_id,member_id,target_type,plan_item_id,preference) values ('50000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000051','plan_item',gen_random_uuid(),'keen')$$, 'P0001', 'Invalid collaboration target', 'cross-trip or missing targets are rejected');
select throws_ok($$update public.decisions set resolved_option_id=gen_random_uuid() where id='54000000-0000-0000-0000-000000000051'$$, '23503', null, 'resolved option must belong to decision');

select * from finish();
rollback;
