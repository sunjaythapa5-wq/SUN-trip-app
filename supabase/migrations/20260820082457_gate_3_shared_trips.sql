begin;

-- Gate 3 narrows trip editing to planners and owners. Travellers and viewers
-- remain read-only until later collaboration gates define their contributions.
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
      and role in ('owner', 'planner')
  );
$$;

create or replace function private.can_invite_to_trip(target_trip_id uuid)
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
      and role in ('owner', 'planner')
  );
$$;

revoke all on function private.can_invite_to_trip(uuid) from public, anon;
grant execute on function private.can_invite_to_trip(uuid) to authenticated;

create or replace function public.create_trip_with_dates(
  trip_name text,
  trip_origin text,
  trip_start_date date,
  trip_end_date date,
  trip_currency text
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
  if trip_name is null or char_length(trim(trip_name)) not between 1 and 120 then raise exception 'Invalid trip name'; end if;
  if trip_origin is null or char_length(trim(trip_origin)) not between 1 and 120 then
    raise exception 'Invalid trip origin';
  end if;
  if trip_start_date is null or trip_end_date is null or trip_end_date < trip_start_date then
    raise exception 'Invalid trip dates';
  end if;
  if trip_currency is null or trip_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  insert into public.trips (
    owner_id,
    name,
    origin,
    start_date,
    end_date,
    date_precision,
    primary_currency,
    created_by
  ) values (
    current_user_id,
    trim(trip_name),
    trim(trip_origin),
    trip_start_date,
    trip_end_date,
    'exact',
    upper(trip_currency),
    current_user_id
  ) returning * into created_trip;

  insert into public.trip_members (trip_id, user_id, role)
  values (created_trip.id, current_user_id, 'owner');

  return created_trip;
end;
$$;

revoke all on function public.create_trip_with_dates(text, text, date, date, text) from public, anon;
grant execute on function public.create_trip_with_dates(text, text, date, date, text) to authenticated;

create or replace function public.create_trip_invite(
  target_trip_id uuid,
  invite_email text,
  invite_role public.trip_role
)
returns table (invite_id uuid, invite_token text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(invite_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_invite_id uuid;
  expiry timestamptz := now() + interval '7 days';
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not private.can_invite_to_trip(target_trip_id) then raise exception 'Permission denied'; end if;
  if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid invitation email';
  end if;
  if invite_role is null or invite_role = 'owner' then raise exception 'Invalid invitation role'; end if;

  -- Reissuing an invite invalidates any previous unused link for this address.
  update public.trip_invites
  set revoked_at = now()
  where trip_id = target_trip_id
    and lower(email) = normalized_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.trip_invites (
    trip_id,
    email,
    token_hash,
    role,
    invited_by,
    expires_at
  ) values (
    target_trip_id,
    normalized_email,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    invite_role,
    current_user_id,
    expiry
  ) returning id into new_invite_id;

  return query select new_invite_id, raw_token, expiry;
end;
$$;

revoke all on function public.create_trip_invite(uuid, text, public.trip_role) from public, anon;
grant execute on function public.create_trip_invite(uuid, text, public.trip_role) to authenticated;

create or replace function public.preview_trip_invite(invite_token text)
returns table (trip_name text, invite_role public.trip_role, invite_expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if invite_token is null or char_length(invite_token) < 32 then raise exception 'Invalid invitation'; end if;

  return query
  select trips.name, invites.role, invites.expires_at
  from public.trip_invites invites
  join public.trips on trips.id = invites.trip_id
  where invites.token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
    and invites.accepted_at is null
    and invites.revoked_at is null
    and invites.expires_at > now()
    and lower(invites.email) = current_email;
end;
$$;

revoke all on function public.preview_trip_invite(text) from public, anon;
grant execute on function public.preview_trip_invite(text) to authenticated;

create or replace function public.revoke_trip_invite(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_trip_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select trip_id into target_trip_id
  from public.trip_invites
  where id = target_invite_id and accepted_at is null and revoked_at is null
  for update;

  if not found then raise exception 'Invitation is not active'; end if;
  if not private.can_invite_to_trip(target_trip_id) then raise exception 'Permission denied'; end if;

  update public.trip_invites set revoked_at = now() where id = target_invite_id;
end;
$$;

revoke all on function public.revoke_trip_invite(uuid) from public, anon;
grant execute on function public.revoke_trip_invite(uuid) to authenticated;

create or replace function public.leave_trip(target_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_role public.trip_role;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;

  select role into current_role
  from public.trip_members
  where trip_id = target_trip_id and user_id = current_user_id and status = 'active'
  for update;

  if not found then raise exception 'Active membership required'; end if;
  if current_role = 'owner' then raise exception 'The owner must delete the trip instead'; end if;

  update public.trip_members
  set status = 'removed', removed_at = now()
  where trip_id = target_trip_id and user_id = current_user_id;
end;
$$;

revoke all on function public.leave_trip(uuid) from public, anon;
grant execute on function public.leave_trip(uuid) to authenticated;

create or replace function private.protect_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id <> old.trip_id or new.user_id <> old.user_id then
    raise exception 'Membership identity cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_membership_identity_before_update
before update on public.trip_members
for each row execute function private.protect_membership_identity();

drop policy if exists members_insert_owner on public.trip_members;
drop policy if exists members_delete_owner on public.trip_members;

drop policy if exists invites_read_owner on public.trip_invites;
drop policy if exists invites_insert_owner on public.trip_invites;
drop policy if exists invites_update_owner on public.trip_invites;
drop policy if exists invites_delete_owner on public.trip_invites;

create policy invites_read_trip_inviter on public.trip_invites for select to authenticated
using ((select private.can_invite_to_trip(trip_id)));

revoke insert, delete on table public.trip_members from authenticated;
revoke insert, update, delete on table public.trip_invites from authenticated;
grant select, update on table public.trip_members to authenticated;
grant select on table public.trip_invites to authenticated;

create index if not exists trip_invites_trip_email_idx
on public.trip_invites (trip_id, lower(email));

comment on function public.create_trip_with_dates is
  'Creates a Gate 3 trip and immutable owner membership atomically.';
comment on function public.create_trip_invite is
  'Creates an email-bound, seven-day, single-use invitation and returns its raw token once.';
comment on function public.leave_trip is
  'Soft-removes the signed-in non-owner from a trip.';

commit;
