begin;

create type public.preference_value as enum ('must_do', 'keen', 'maybe', 'skip');
create type public.participation_value as enum ('going', 'not_going');
create type public.collaboration_target_type as enum ('idea', 'plan_item');
create type public.decision_status as enum ('open', 'resolved');
create type public.decision_option_kind as enum ('text', 'idea', 'plan_item', 'scenario');

create or replace function private.can_plan_trip(target_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = (select auth.uid())
      and status = 'active' and role in ('owner', 'planner')
  );
$$;

create or replace function private.can_collaborate_trip(target_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = (select auth.uid())
      and status = 'active' and role in ('owner', 'planner', 'traveller')
  );
$$;

create or replace function private.can_manage_decisions(target_trip_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = (select auth.uid())
      and status = 'active' and role in ('owner', 'planner')
  );
$$;

revoke all on function private.can_collaborate_trip(uuid), private.can_manage_decisions(uuid) from public, anon;
grant execute on function private.can_collaborate_trip(uuid), private.can_manage_decisions(uuid) to authenticated;

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  target_type public.collaboration_target_type not null,
  idea_id uuid,
  plan_item_id uuid,
  preference public.preference_value not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reaction_member_fk foreign key (trip_id, member_id) references public.trip_members(trip_id, user_id),
  constraint reaction_idea_fk foreign key (idea_id, trip_id) references public.ideas(id, trip_id) on delete cascade,
  constraint reaction_plan_item_fk foreign key (plan_item_id, trip_id) references public.plan_items(id, trip_id) on delete cascade,
  constraint reaction_target_consistent check (
    (target_type = 'idea' and idea_id is not null and plan_item_id is null) or
    (target_type = 'plan_item' and plan_item_id is not null and idea_id is null)
  )
);

create unique index reactions_one_idea_preference on public.reactions (trip_id, member_id, idea_id) where idea_id is not null;
create unique index reactions_one_item_preference on public.reactions (trip_id, member_id, plan_item_id) where plan_item_id is not null;
create index reactions_trip_target_idx on public.reactions (trip_id, target_type, idea_id, plan_item_id);

create table public.item_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  plan_item_id uuid not null,
  member_id uuid not null references public.profiles(id),
  participation public.participation_value not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_item_fk foreign key (plan_item_id, trip_id) references public.plan_items(id, trip_id) on delete cascade,
  constraint participant_member_fk foreign key (trip_id, member_id) references public.trip_members(trip_id, user_id),
  constraint participant_once unique (trip_id, plan_item_id, member_id)
);

create index item_participants_trip_item_idx on public.item_participants (trip_id, plan_item_id);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 240),
  status public.decision_status not null default 'open',
  resolved_option_id uuid,
  created_by uuid not null default auth.uid() references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decision_identity unique (id, trip_id),
  constraint decision_resolution_consistent check (
    (status = 'open' and resolved_option_id is null and resolved_by is null and resolved_at is null) or
    (status = 'resolved' and resolved_option_id is not null and resolved_by is not null and resolved_at is not null)
  )
);

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  trip_id uuid not null,
  label text not null check (char_length(trim(label)) between 1 and 180),
  option_kind public.decision_option_kind not null default 'text',
  linked_idea_id uuid,
  linked_plan_item_id uuid,
  linked_scenario_id uuid,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint decision_option_identity unique (id, decision_id, trip_id),
  constraint option_decision_fk foreign key (decision_id, trip_id) references public.decisions(id, trip_id) on delete cascade,
  constraint option_idea_fk foreign key (linked_idea_id, trip_id) references public.ideas(id, trip_id) on delete set null (linked_idea_id),
  constraint option_item_fk foreign key (linked_plan_item_id, trip_id) references public.plan_items(id, trip_id) on delete set null (linked_plan_item_id),
  constraint option_order_unique unique (decision_id, sort_order),
  constraint option_link_consistent check (
    (option_kind = 'text' and linked_idea_id is null and linked_plan_item_id is null and linked_scenario_id is null) or
    (option_kind = 'idea' and linked_idea_id is not null and linked_plan_item_id is null and linked_scenario_id is null) or
    (option_kind = 'plan_item' and linked_plan_item_id is not null and linked_idea_id is null and linked_scenario_id is null) or
    (option_kind = 'scenario' and linked_scenario_id is not null and linked_idea_id is null and linked_plan_item_id is null)
  )
);

alter table public.decisions add constraint resolved_option_belongs_to_decision
  foreign key (resolved_option_id, id, trip_id)
  references public.decision_options(id, decision_id, trip_id);

create table public.decision_responses (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null,
  option_id uuid not null,
  trip_id uuid not null,
  member_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint response_decision_fk foreign key (decision_id, trip_id) references public.decisions(id, trip_id) on delete cascade,
  constraint response_option_fk foreign key (option_id, decision_id, trip_id) references public.decision_options(id, decision_id, trip_id) on delete cascade,
  constraint response_member_fk foreign key (trip_id, member_id) references public.trip_members(trip_id, user_id),
  constraint response_once unique (decision_id, member_id)
);

create index decisions_trip_status_idx on public.decisions (trip_id, status, created_at desc);
create index decision_options_decision_order_idx on public.decision_options (decision_id, sort_order);
create index decision_responses_decision_idx on public.decision_responses (decision_id, option_id);

create or replace function private.validate_collaboration_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.target_type = 'idea' then
    if not exists (select 1 from public.ideas where id = new.idea_id and trip_id = new.trip_id) then
      raise exception 'Invalid collaboration target';
    end if;
  elsif not exists (
    select 1 from public.plan_items
    where id = new.plan_item_id and trip_id = new.trip_id
      and item_type in ('activity', 'food_place', 'event', 'custom')
  ) then
    raise exception 'Invalid collaboration target';
  end if;
  return new;
end;
$$;

create or replace function private.validate_participation_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.plan_items
    where id = new.plan_item_id and trip_id = new.trip_id
      and item_type in ('activity', 'food_place', 'event', 'custom')
  ) then raise exception 'Invalid participation target'; end if;
  return new;
end;
$$;

create or replace function private.touch_collaboration_record()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger reactions_validate before insert or update on public.reactions for each row execute function private.validate_collaboration_target();
create trigger participants_validate before insert or update on public.item_participants for each row execute function private.validate_participation_target();
create trigger reactions_touch before update on public.reactions for each row execute function private.touch_collaboration_record();
create trigger participants_touch before update on public.item_participants for each row execute function private.touch_collaboration_record();
create trigger decisions_touch before update on public.decisions for each row execute function private.touch_collaboration_record();
create trigger responses_touch before update on public.decision_responses for each row execute function private.touch_collaboration_record();

create or replace function public.create_trip_decision(target_trip_id uuid, decision_question text, option_labels text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_decision_id uuid; option_label text; option_index integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_decisions(target_trip_id) then raise exception 'Permission denied'; end if;
  if decision_question is null or char_length(trim(decision_question)) not between 1 and 240 then raise exception 'Invalid decision question'; end if;
  if coalesce(array_length(option_labels, 1), 0) not between 2 and 8 then raise exception 'A decision needs 2 to 8 options'; end if;

  insert into public.decisions (trip_id, question, created_by)
  values (target_trip_id, trim(decision_question), auth.uid()) returning id into created_decision_id;

  foreach option_label in array option_labels loop
    if option_label is null or char_length(trim(option_label)) not between 1 and 180 then raise exception 'Invalid decision option'; end if;
    insert into public.decision_options (decision_id, trip_id, label, sort_order)
    values (created_decision_id, target_trip_id, trim(option_label), option_index);
    option_index := option_index + 1;
  end loop;
  return created_decision_id;
end;
$$;

create or replace function public.resolve_trip_decision(target_decision_id uuid, target_option_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_trip_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select trip_id into target_trip_id from public.decisions where id = target_decision_id and status = 'open' for update;
  if not found then raise exception 'Decision is not open'; end if;
  if not private.can_manage_decisions(target_trip_id) then raise exception 'Permission denied'; end if;
  if not exists (select 1 from public.decision_options where id = target_option_id and decision_id = target_decision_id and trip_id = target_trip_id) then raise exception 'Invalid decision option'; end if;
  update public.decisions set status = 'resolved', resolved_option_id = target_option_id, resolved_by = auth.uid(), resolved_at = now()
  where id = target_decision_id;
end;
$$;

revoke all on function public.create_trip_decision(uuid, text, text[]), public.resolve_trip_decision(uuid, uuid) from public, anon;
grant execute on function public.create_trip_decision(uuid, text, text[]), public.resolve_trip_decision(uuid, uuid) to authenticated;

alter table public.reactions enable row level security;
alter table public.item_participants enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_options enable row level security;
alter table public.decision_responses enable row level security;

create policy reactions_read_members on public.reactions for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy reactions_insert_self on public.reactions for insert to authenticated with check ((select private.can_collaborate_trip(trip_id)) and member_id = (select auth.uid()));
create policy reactions_update_self on public.reactions for update to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id))) with check (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));
create policy reactions_delete_self on public.reactions for delete to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));

create policy participants_read_members on public.item_participants for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy participants_insert_self on public.item_participants for insert to authenticated with check ((select private.can_collaborate_trip(trip_id)) and member_id = (select auth.uid()));
create policy participants_update_self on public.item_participants for update to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id))) with check (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));
create policy participants_delete_self on public.item_participants for delete to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));

create policy decisions_read_members on public.decisions for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy decisions_insert_managers on public.decisions for insert to authenticated with check ((select private.can_manage_decisions(trip_id)) and created_by = (select auth.uid()));
create policy decisions_update_managers on public.decisions for update to authenticated using ((select private.can_manage_decisions(trip_id))) with check ((select private.can_manage_decisions(trip_id)));
create policy decisions_delete_managers on public.decisions for delete to authenticated using ((select private.can_manage_decisions(trip_id)));

create policy options_read_members on public.decision_options for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy options_insert_managers on public.decision_options for insert to authenticated with check ((select private.can_manage_decisions(trip_id)));
create policy options_update_managers on public.decision_options for update to authenticated using ((select private.can_manage_decisions(trip_id))) with check ((select private.can_manage_decisions(trip_id)));
create policy options_delete_managers on public.decision_options for delete to authenticated using ((select private.can_manage_decisions(trip_id)));

create policy responses_read_members on public.decision_responses for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy responses_insert_self on public.decision_responses for insert to authenticated with check ((select private.can_collaborate_trip(trip_id)) and member_id = (select auth.uid()));
create policy responses_update_self on public.decision_responses for update to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id))) with check (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));
create policy responses_delete_self on public.decision_responses for delete to authenticated using (member_id = (select auth.uid()) and (select private.can_collaborate_trip(trip_id)));

grant select, insert, update, delete on public.reactions, public.item_participants, public.decisions, public.decision_options, public.decision_responses to authenticated;

comment on table public.reactions is 'Lightweight personal trip preferences, separate from attendance and decisions.';
comment on table public.item_participants is 'Optional attendance responses, independent from preference.';
comment on table public.decisions is 'Deliberate human choices; resolution records intent and never applies trip changes automatically.';
comment on column public.decision_options.linked_scenario_id is 'Reserved identifier for a future scenario link; Gate 5 does not create scenario options.';
comment on function public.create_trip_decision(uuid, text, text[]) is 'Authenticated transactional boundary; checks active Owner/Planner membership before creating a Decision and its options.';
comment on function public.resolve_trip_decision(uuid, uuid) is 'Authenticated transactional boundary; checks active Owner/Planner membership and option ownership. It records resolution only.';

commit;
