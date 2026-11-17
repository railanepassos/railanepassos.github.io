-- Phase 4.1: shared plan, write side (tick an item).
--
-- Whoever holds a plan link token can toggle `done` of ONE plan item, through
-- the function below and nothing else. No table policy is created or changed;
-- anon still cannot read or update public.links.
--
-- Errors are distinguishable by message (PostgREST returns it in the body):
--   inactive  null, malformed, unknown or switched-off token
--   conflict  idx out of range, plan missing, or plan_items[idx].text differs
--             from expected_text (the plan changed since the client loaded it)
--   invalid   done is null
-- Token problems are checked first, so a caller without a valid token learns
-- nothing about the plan.

create or replace function public.links_shared_plan_set_done(
  token text,
  idx int,
  expected_text text,
  done boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_id uuid;
  items jsonb;
begin
  if token is null or token operator(pg_catalog.!~) '^[0-9a-f]{32,64}$' then
    raise exception 'inactive' using errcode = 'P0001';
  end if;

  -- Lock the row so two concurrent ticks cannot lose each other's change.
  select l.id, l.plan_items
    into link_id, items
    from public.links as l
   where l.plan_share_token is not null
     and l.plan_share_token = token
   for update;
  if not found then
    raise exception 'inactive' using errcode = 'P0001';
  end if;

  if done is null then
    raise exception 'invalid' using errcode = 'P0001';
  end if;

  if idx is null
     or expected_text is null
     or items is null
     or pg_catalog.jsonb_typeof(items) <> 'array'
     or idx < 0
     or idx >= pg_catalog.jsonb_array_length(items)
     or (items -> idx ->> 'text') is distinct from expected_text then
    raise exception 'conflict' using errcode = 'P0001';
  end if;

  update public.links as l
     set plan_items = pg_catalog.jsonb_set(
           l.plan_items,
           array[idx::text, 'done'],
           pg_catalog.to_jsonb(done),
           false
         )
   where l.id = link_id;

  return public.links_shared_plan_get(token);
end;
$$;

revoke execute on function public.links_shared_plan_set_done(text, int, text, boolean) from public;
grant execute on function public.links_shared_plan_set_done(text, int, text, boolean)
  to anon, authenticated;
