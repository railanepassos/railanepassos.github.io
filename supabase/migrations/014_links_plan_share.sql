-- Phase 4.1: shareable trip plan link (read side).
--
-- A place can have a "link do plano": a random token the editors turn on and
-- off. Whoever holds the token can read the plan (and nothing else) through
-- links_shared_plan_get, without logging in. The table stays closed to anon:
-- NO table policy is created or changed here (anon still has no SELECT policy
-- on public.links); the only public door is the function below.
--
--   plan_share_token null     -> link off
--   plan_share_token not null -> link on; the token lives in the URL fragment

alter table public.links
  add column if not exists plan_share_token text;

-- Hex, 32 to 64 characters (the generated tokens have 64 = 256 bits).
alter table public.links drop constraint if exists links_plan_share_token_format;
alter table public.links
  add constraint links_plan_share_token_format
  check (plan_share_token is null or plan_share_token ~ '^[0-9a-f]{32,64}$');

-- Unique when not null (a partial index also keeps lookups by token fast).
create unique index if not exists links_plan_share_token_unique
  on public.links (plan_share_token)
  where plan_share_token is not null;

-- Editor: turn the link on, or rotate it ("Trocar link"). SECURITY INVOKER: the
-- row-level policies of public.links decide who may update, so anon (no execute,
-- no update policy) cannot reach it. Token generated here, never by the client:
-- two uuids without dashes = 64 hex characters.
create or replace function public.links_plan_share_enable(link_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_token text;
begin
  update public.links
     set plan_share_token = replace(gen_random_uuid()::text, '-', '')
                         || replace(gen_random_uuid()::text, '-', '')
   where id = link_id
   returning plan_share_token into new_token;
  if new_token is null then
    raise exception 'link not found';
  end if;
  return new_token;
end;
$$;

-- Editor: turn the link off (the old token stops working at once).
create or replace function public.links_plan_share_disable(link_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.links set plan_share_token = null where id = link_id;
$$;

-- Public: read the shared plan. SECURITY DEFINER because anon cannot read the
-- table; it returns ONLY the fields below, and null for a null, malformed or
-- unknown token (indistinguishable, so tokens cannot be probed).
create or replace function public.links_shared_plan_get(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'label', l.label,
    'scheduled_start', l.scheduled_start,
    'scheduled_end', l.scheduled_end,
    'city', l.city,
    'address', l.address,
    'itinerary', l.itinerary,
    'people', to_jsonb(l.people),
    'plan_items', l.plan_items
  )
  from public.links as l
  where token is not null
    and token operator(pg_catalog.~) '^[0-9a-f]{32,64}$'
    and l.plan_share_token is not null
    and l.plan_share_token = token
  limit 1;
$$;

revoke execute on function public.links_plan_share_enable(uuid) from public, anon;
revoke execute on function public.links_plan_share_disable(uuid) from public, anon;
grant execute on function public.links_plan_share_enable(uuid) to authenticated;
grant execute on function public.links_plan_share_disable(uuid) to authenticated;

revoke execute on function public.links_shared_plan_get(text) from public;
grant execute on function public.links_shared_plan_get(text) to anon, authenticated;
