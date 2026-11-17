-- Fontes: public links an item's dossier and itinerary came from.
--
-- sources: array of {title, url}, at most 10 items.
--   title: string, 1..120 characters after trimming
--   url:   https string, at most 2000 characters
--   no other keys
-- Limits are mirrored in src/links/sources.ts (sync test in
-- tests/unit/sources.test.ts). No policy change: the row-level policies on
-- public.links already cover the new column.
alter table public.links
  add column if not exists sources jsonb not null default '[]'::jsonb;

-- CHECK constraints cannot contain subqueries, so the per-item rules live in
-- an immutable helper (same pattern as links_plan_items_valid in 013).
create or replace function public.links_sources_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select items is not null
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 10
    and not exists (
      select 1
      from jsonb_array_elements(items) as item
      where jsonb_typeof(item) <> 'object'
        or (select count(*) from jsonb_object_keys(item)) <> 2
        or jsonb_typeof(item -> 'title') is distinct from 'string'
        or char_length(btrim(item ->> 'title')) not between 1 and 120
        or jsonb_typeof(item -> 'url') is distinct from 'string'
        or char_length(item ->> 'url') > 2000
        or (item ->> 'url') !~ '^https://[^[:space:]]+$'
    );
$$;

-- Only meant for the CHECK constraint: not callable by anon (it would
-- otherwise be exposed as RPC); the roles that write rows keep execute.
revoke execute on function public.links_sources_valid(jsonb) from public, anon;
grant execute on function public.links_sources_valid(jsonb) to authenticated, service_role;

alter table public.links drop constraint if exists links_sources_valid;
alter table public.links
  add constraint links_sources_valid
  check (public.links_sources_valid(sources));
