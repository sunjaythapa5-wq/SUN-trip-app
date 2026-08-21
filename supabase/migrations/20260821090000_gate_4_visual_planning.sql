begin;

create type public.plan_item_type as enum ('stay', 'transport', 'activity', 'food_place', 'event', 'free_time', 'custom');
create type public.plan_item_status as enum ('planned', 'needs_checking', 'confirmed', 'booked');
create type public.idea_status as enum ('unscheduled', 'scheduled');

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  start_date date not null,
  end_date date not null,
  sort_order integer not null check (sort_order >= 0),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destination_dates_valid check (end_date >= start_date),
  constraint destination_identity unique (id, trip_id),
  constraint destination_order_unique unique (trip_id, sort_order) deferrable initially deferred
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_type public.plan_item_type not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  destination_id uuid,
  end_destination_id uuid,
  item_date date,
  end_date date,
  start_time time,
  end_time time,
  sort_order integer not null default 0 check (sort_order >= 0),
  location text check (location is null or char_length(location) <= 240),
  provider text check (provider is null or char_length(provider) <= 160),
  address text check (address is null or char_length(address) <= 500),
  booking_reference text check (booking_reference is null or char_length(booking_reference) <= 160),
  cost numeric(14,2) check (cost is null or cost >= 0),
  status public.plan_item_status not null default 'planned',
  notes text check (notes is null or char_length(notes) <= 4000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_item_destination_fk foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete cascade,
  constraint plan_item_end_destination_fk foreign key (end_destination_id, trip_id) references public.destinations(id, trip_id) on delete cascade,
  constraint plan_item_identity unique (id, trip_id),
  constraint plan_item_dates_valid check (end_date is null or item_date is null or end_date >= item_date),
  constraint plan_item_times_valid check (end_time is null or start_time is null or end_time >= start_time),
  constraint transport_has_endpoints check (item_type <> 'transport' or (destination_id is not null and end_destination_id is not null)),
  constraint stay_has_dates check (item_type <> 'stay' or (destination_id is not null and item_date is not null and end_date is not null))
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 160),
  link text check (link is null or char_length(link) <= 2000),
  category text not null default 'other' check (char_length(category) between 1 and 60),
  notes text check (notes is null or char_length(notes) <= 4000),
  status public.idea_status not null default 'unscheduled',
  scheduled_plan_item_id uuid,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idea_destination_fk foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete set null (destination_id),
  constraint idea_scheduled_item_fk foreign key (scheduled_plan_item_id, trip_id) references public.plan_items(id, trip_id) on delete set null (scheduled_plan_item_id),
  constraint idea_schedule_consistent check (
    (status = 'unscheduled' and scheduled_plan_item_id is null) or
    (status = 'scheduled' and scheduled_plan_item_id is not null)
  )
);

create index destinations_trip_order_idx on public.destinations (trip_id, sort_order);
create index plan_items_trip_date_order_idx on public.plan_items (trip_id, item_date, sort_order);
create index plan_items_destination_idx on public.plan_items (destination_id);
create index plan_items_end_destination_idx on public.plan_items (end_destination_id) where end_destination_id is not null;
create index ideas_trip_status_idx on public.ideas (trip_id, status, created_at desc);
create index ideas_destination_idx on public.ideas (destination_id) where destination_id is not null;
create index ideas_scheduled_item_idx on public.ideas (scheduled_plan_item_id) where scheduled_plan_item_id is not null;

create or replace function private.can_plan_trip(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id
      and user_id = (select auth.uid())
      and status = 'active'
      and role in ('owner', 'planner', 'traveller')
  );
$$;

revoke all on function private.can_plan_trip(uuid) from public, anon;
grant execute on function private.can_plan_trip(uuid) to authenticated;

create or replace function private.touch_planning_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger destinations_touch before update on public.destinations for each row execute function private.touch_planning_record();
create trigger plan_items_touch before update on public.plan_items for each row execute function private.touch_planning_record();
create trigger ideas_touch before update on public.ideas for each row execute function private.touch_planning_record();

create or replace function private.unschedule_linked_ideas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.ideas set status = 'unscheduled', scheduled_plan_item_id = null where scheduled_plan_item_id = old.id;
  return old;
end;
$$;

create trigger plan_items_unschedule_ideas before delete on public.plan_items for each row execute function private.unschedule_linked_ideas();

create or replace function public.schedule_trip_idea(target_idea_id uuid, target_destination_id uuid, target_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_idea public.ideas;
  created_item_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into source_idea from public.ideas where id = target_idea_id for update;
  if not found or source_idea.status <> 'unscheduled' then raise exception 'Idea is not available'; end if;
  if not private.can_plan_trip(source_idea.trip_id) then raise exception 'Permission denied'; end if;
  if not exists (
    select 1 from public.destinations
    where id = target_destination_id and trip_id = source_idea.trip_id
      and target_date between start_date and end_date
  ) then raise exception 'Invalid destination date'; end if;

  insert into public.plan_items (trip_id, item_type, title, destination_id, item_date, status, notes, created_by)
  values (source_idea.trip_id, 'activity', source_idea.title, target_destination_id, target_date, 'planned', source_idea.notes, auth.uid())
  returning id into created_item_id;

  update public.ideas set status = 'scheduled', scheduled_plan_item_id = created_item_id where id = source_idea.id;
  return created_item_id;
end;
$$;

revoke all on function public.schedule_trip_idea(uuid, uuid, date) from public, anon;
grant execute on function public.schedule_trip_idea(uuid, uuid, date) to authenticated;

alter table public.destinations enable row level security;
alter table public.plan_items enable row level security;
alter table public.ideas enable row level security;

create policy destinations_read_members on public.destinations for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy destinations_insert_planners on public.destinations for insert to authenticated with check ((select private.can_plan_trip(trip_id)) and created_by = (select auth.uid()));
create policy destinations_update_planners on public.destinations for update to authenticated using ((select private.can_plan_trip(trip_id))) with check ((select private.can_plan_trip(trip_id)));
create policy destinations_delete_planners on public.destinations for delete to authenticated using ((select private.can_plan_trip(trip_id)));

create policy plan_items_read_members on public.plan_items for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy plan_items_insert_planners on public.plan_items for insert to authenticated with check ((select private.can_plan_trip(trip_id)) and created_by = (select auth.uid()));
create policy plan_items_update_planners on public.plan_items for update to authenticated using ((select private.can_plan_trip(trip_id))) with check ((select private.can_plan_trip(trip_id)));
create policy plan_items_delete_planners on public.plan_items for delete to authenticated using ((select private.can_plan_trip(trip_id)));

create policy ideas_read_members on public.ideas for select to authenticated using ((select private.is_trip_member(trip_id)));
create policy ideas_insert_planners on public.ideas for insert to authenticated with check ((select private.can_plan_trip(trip_id)) and created_by = (select auth.uid()));
create policy ideas_update_planners on public.ideas for update to authenticated using ((select private.can_plan_trip(trip_id))) with check ((select private.can_plan_trip(trip_id)));
create policy ideas_delete_planners on public.ideas for delete to authenticated using ((select private.can_plan_trip(trip_id)));

grant select, insert, update, delete on public.destinations, public.plan_items, public.ideas to authenticated;

comment on table public.destinations is 'Ordered structural stops; dates derive the visual day timeline.';
comment on table public.plan_items is 'Stable itinerary facts suitable for deterministic checking and future scenario overlays.';
comment on table public.ideas is 'Intentionally unscheduled possibilities, optionally linked to their scheduled plan item.';

commit;
