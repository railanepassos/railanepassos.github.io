-- Phase 4: trip plan (checklist and shopping list of a place).
--
-- plan_items is optional and null by default, so existing rows stay valid.
-- Participants reuse the people column from migration 011. RLS needs no
-- change: the policies on public.links are row-level, so they already cover
-- the new column. Marking a place as done only changes status/completed_at;
-- the plan is never touched by it.
alter table public.links
  add column if not exists plan_items jsonb;

-- plan_items: array of {text, list, who?, done}, max 60 items.
--   text: string, 1..200 characters
--   list: "checklist" | "compras"
--   who:  optional string, up to 80 characters (a name only, never a phone)
--   done: boolean
-- Limits are mirrored in src/links/plan.ts. CHECK constraints cannot contain
-- subqueries, so the per-item rules live in an immutable helper (same pattern
-- as links_pose_refs_valid in 011).
create or replace function public.links_plan_items_valid(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select items is null
    or (
      jsonb_typeof(items) = 'array'
      and jsonb_array_length(items) <= 60
      and not exists (
        select 1
        from jsonb_array_elements(items) as item
        where jsonb_typeof(item) <> 'object'
          or jsonb_typeof(item -> 'text') is distinct from 'string'
          or char_length(item ->> 'text') not between 1 and 200
          or jsonb_typeof(item -> 'list') is distinct from 'string'
          or (item ->> 'list') not in ('checklist', 'compras')
          or (item ? 'who' and (
            jsonb_typeof(item -> 'who') <> 'string' or char_length(item ->> 'who') > 80
          ))
          or jsonb_typeof(item -> 'done') is distinct from 'boolean'
      )
    );
$$;

-- Only meant for the CHECK constraint: not callable by anon (it would
-- otherwise be exposed as RPC); the roles that write rows keep execute.
revoke execute on function public.links_plan_items_valid(jsonb) from public, anon;
grant execute on function public.links_plan_items_valid(jsonb) to authenticated, service_role;

alter table public.links drop constraint if exists links_plan_items_valid;
alter table public.links
  add constraint links_plan_items_valid
  check (public.links_plan_items_valid(plan_items));
