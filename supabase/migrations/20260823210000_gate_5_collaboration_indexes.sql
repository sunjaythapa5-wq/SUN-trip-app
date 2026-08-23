begin;

create index reactions_idea_fk_idx on public.reactions (idea_id, trip_id) where idea_id is not null;
create index reactions_plan_item_fk_idx on public.reactions (plan_item_id, trip_id) where plan_item_id is not null;
create index reactions_member_idx on public.reactions (member_id);

create index item_participants_item_trip_idx on public.item_participants (plan_item_id, trip_id);
create index item_participants_member_idx on public.item_participants (member_id);
create index item_participants_trip_member_idx on public.item_participants (trip_id, member_id);

create index decisions_created_by_idx on public.decisions (created_by);
create index decisions_resolved_by_idx on public.decisions (resolved_by) where resolved_by is not null;
create index decisions_resolved_option_idx on public.decisions (resolved_option_id, id, trip_id) where resolved_option_id is not null;

create index decision_options_decision_trip_idx on public.decision_options (decision_id, trip_id);
create index decision_options_idea_idx on public.decision_options (linked_idea_id, trip_id) where linked_idea_id is not null;
create index decision_options_item_idx on public.decision_options (linked_plan_item_id, trip_id) where linked_plan_item_id is not null;

create index decision_responses_member_idx on public.decision_responses (member_id);
create index decision_responses_decision_trip_idx on public.decision_responses (decision_id, trip_id);
create index decision_responses_trip_member_idx on public.decision_responses (trip_id, member_id);
create index decision_responses_option_idx on public.decision_responses (option_id, decision_id, trip_id);

commit;
