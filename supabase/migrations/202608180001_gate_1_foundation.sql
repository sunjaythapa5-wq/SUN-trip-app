begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.trip_role as enum ('owner', 'planner', 'traveller', 'viewer');
create type public.trip_status as enum ('planning', 'active', 'completed', 'archived');
create type public.member_status as enum ('active', 'removed');
create type public.date_precision as enum ('exact', 'approximate', 'unknown');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 120),
  origin text,
  start_date date,
  end_date date,
  date_precision public.date_precision not null default 'unknown',
  primary_currency text not null default 'AUD' check (primary_currency ~ '^[A-Z]{3}$'),
  budget_target numeric(14,2) check (budget_target is null or budget_target >= 0),
  status public.trip_status not null default 'planning',
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_trip_dates check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (trip_id, user_id),
  constraint removal_state_consistent check (
    (status = 'active' and removed_at is null) or (status = 'removed' and removed_at is not null)
  )
);

create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text,
  token_hash text not null unique,
  role public.trip_role not null check (role <> 'owner'),
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invite_terminal_state check (not (accepted_at is not null and revoked_at is not null)),
  constraint accepted_invite_has_user check (accepted_at is null or accepted_by is not null)
);

create index trip_members_user_active_idx on public.trip_members (user_id, trip_id) where status = 'active';
create index trip_invites_trip_idx on public.trip_invites (trip_id);
create index trip_invites_expiry_idx on public.trip_invites (expires_at) where accepted_at is null and revoked_at is null;

create or replace function private.is_trip_member(target_trip_id uuid)
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
  );
$$;

create or replace function private.can_edit_trip(target_trip_id uuid)
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

create or replace function private.is_trip_owner(target_trip_id uuid)
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
      and role = 'owner'
  );
$$;

revoke all on function private.is_trip_member(uuid) from public;
revoke all on function private.can_edit_trip(uuid) from public;
revoke all on function private.is_trip_owner(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;
grant execute on function private.can_edit_trip(uuid) to authenticated;
grant execute on function private.is_trip_owner(uuid) to authenticated;

create or replace function public.create_trip(
  trip_name text,
  trip_origin text default null,
  trip_currency text default 'AUD'
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_trip public.trips;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(trip_name)) not between 1 and 120 then raise exception 'Invalid trip name'; end if;
  if trip_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;

  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;
  insert into public.trips (owner_id, name, origin, primary_currency, created_by)
  values (current_user_id, trim(trip_name), nullif(trim(trip_origin), ''), trip_currency, current_user_id)
  returning * into created_trip;
  insert into public.trip_members (trip_id, user_id, role)
  values (created_trip.id, current_user_id, 'owner');
  return created_trip;
end;
$$;

revoke all on function public.create_trip(text, text, text) from public, anon;
grant execute on function public.create_trip(text, text, text) to authenticated;

create or replace function public.accept_trip_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  matched_invite public.trip_invites;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if invite_token is null or char_length(invite_token) < 32 then raise exception 'Invalid invitation'; end if;

  select * into matched_invite
  from public.trip_invites
  where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;

  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if matched_invite.email is not null and lower(matched_invite.email) <> current_email then
    raise exception 'Invitation belongs to another email address';
  end if;

  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;
  insert into public.trip_members (trip_id, user_id, role, status, removed_at)
  values (matched_invite.trip_id, current_user_id, matched_invite.role, 'active', null)
  on conflict (trip_id, user_id) do update
    set role = excluded.role, status = 'active', removed_at = null, joined_at = now();
  update public.trip_invites
    set accepted_at = now(), accepted_by = current_user_id
    where id = matched_invite.id;
  return matched_invite.trip_id;
end;
$$;

revoke all on function public.accept_trip_invite(text) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;

create or replace function private.protect_trip_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'Trip ownership cannot be changed directly'; end if;
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create trigger protect_trip_owner_before_update
before update on public.trips
for each row execute function private.protect_trip_owner();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;

create policy profiles_read_self_or_trip_member on public.profiles for select to authenticated
using (
  id = (select auth.uid()) or exists (
    select 1 from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active'
      and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy trips_read_members on public.trips for select to authenticated
using ((select private.is_trip_member(id)));
create policy trips_update_editors on public.trips for update to authenticated
using ((select private.can_edit_trip(id)))
with check ((select private.can_edit_trip(id)));
create policy trips_delete_owner on public.trips for delete to authenticated
using ((select private.is_trip_owner(id)));

create policy members_read_members on public.trip_members for select to authenticated
using ((select private.is_trip_member(trip_id)));
create policy members_insert_owner on public.trip_members for insert to authenticated
with check ((select private.is_trip_owner(trip_id)) and role <> 'owner');
create policy members_update_owner on public.trip_members for update to authenticated
using ((select private.is_trip_owner(trip_id)) and role <> 'owner')
with check ((select private.is_trip_owner(trip_id)) and role <> 'owner');
create policy members_delete_owner on public.trip_members for delete to authenticated
using ((select private.is_trip_owner(trip_id)) and role <> 'owner');

create policy invites_read_owner on public.trip_invites for select to authenticated
using ((select private.is_trip_owner(trip_id)));
create policy invites_insert_owner on public.trip_invites for insert to authenticated
with check ((select private.is_trip_owner(trip_id)) and invited_by = (select auth.uid()) and role <> 'owner');
create policy invites_update_owner on public.trip_invites for update to authenticated
using ((select private.is_trip_owner(trip_id)))
with check ((select private.is_trip_owner(trip_id)) and role <> 'owner');
create policy invites_delete_owner on public.trip_invites for delete to authenticated
using ((select private.is_trip_owner(trip_id)));

comment on schema private is 'Non-exposed authorization helpers used by RLS.';
comment on function public.create_trip is 'Atomically creates a trip and its immutable owner membership.';
commit;
