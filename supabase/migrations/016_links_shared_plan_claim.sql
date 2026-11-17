-- Phase 4.1: shared plan, claim side ("Eu levo").
--
-- Whoever holds a plan link token can set or release `who` of ONE plan item,
-- through the function below and nothing else. Mirrors links_shared_plan_set_done
-- (015): same locking, same token-first checks, no table policy created or changed.
--
-- Errors are distinguishable by message (PostgREST returns it in the body):
--   inactive  null, malformed, unknown or switched-off token
--   invalid   who is not null and (after trimming) not exactly one of `people`
--             (people entries are trimmed too; the entry is stored in its own form)
--   conflict  idx out of range, plan missing, or plan_items[idx].text differs
--             from expected_text (the plan changed since the client loaded it)
-- who = null releases the item (the `who` key is removed).

create or replace function public.links_shared_plan_set_who(
  token text,
  idx int,
  expected_text text,
  who text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_id uuid;
  items jsonb;
  participants text[];
  chosen text;
  wanted text;
begin
  if token is null or token operator(pg_catalog.!~) '^[0-9a-f]{32,64}$' then
    raise exception 'inactive' using errcode = 'P0001';
  end if;

  -- Lock the row so concurrent writes cannot lose each other's change.
  select l.id, l.plan_items, l.people
    into link_id, items, participants
    from public.links as l
   where l.plan_share_token is not null
     and l.plan_share_token = token
   for update;
  if not found then
    raise exception 'inactive' using errcode = 'P0001';
  end if;

  if who is not null then
    wanted := pg_catalog.regexp_replace(who, '^\s+|\s+$', '', 'g');
    select p
      into chosen
      from pg_catalog.unnest(participants) as p
     where pg_catalog.regexp_replace(p, '^\s+|\s+$', '', 'g') = wanted
     limit 1;
    if chosen is null then
      raise exception 'invalid' using errcode = 'P0001';
    end if;
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

  if chosen is null then
    update public.links as l
       set plan_items = pg_catalog.jsonb_set(
             l.plan_items,
             array[idx::text],
             (l.plan_items -> idx) operator(pg_catalog.-) 'who',
             false
           )
     where l.id = link_id;
  else
    update public.links as l
       set plan_items = pg_catalog.jsonb_set(
             l.plan_items,
             array[idx::text, 'who'],
             pg_catalog.to_jsonb(chosen),
             true
           )
     where l.id = link_id;
  end if;

  return public.links_shared_plan_get(token);
end;
$$;

revoke execute on function public.links_shared_plan_set_who(text, int, text, text) from public;
grant execute on function public.links_shared_plan_set_who(text, int, text, text)
  to anon, authenticated;
