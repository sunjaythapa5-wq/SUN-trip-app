begin;

create type public.information_confidence as enum ('unknown', 'needs_checking', 'estimated', 'confirmed');

alter table public.plan_items
  add column confidence public.information_confidence not null default 'unknown';

update public.plan_items
set confidence = 'needs_checking', status = 'planned'
where status = 'needs_checking';

comment on column public.plan_items.confidence is 'Confidence in operational facts, independent from planning or booking status.';

commit;
