-- PostgreSQL 17 projects no longer rely on implicit Data API table grants.
-- RLS remains the authorization boundary; these grants only allow policies to run.
revoke all on table public.profiles from anon;
revoke all on table public.trips from anon;
revoke all on table public.trip_members from anon;
revoke all on table public.trip_invites from anon;

grant select, update on table public.profiles to authenticated;
grant select, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.trip_invites to authenticated;
