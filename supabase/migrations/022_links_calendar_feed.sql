-- Phase 10: Google Agenda subscription feed.
--
-- A single secret token lets a calendar app (Google Agenda) read the scheduled
-- places as an .ics feed served by the Edge Function `links-calendar`. The
-- function uses the service role, so it reads this table directly; people never
-- do. The table is closed to anon AND authenticated (RLS on, no policies, no
-- grants): editors reach it only through the three SECURITY DEFINER functions
-- below, each gated by public.links_is_editor() (migration 017).
--
--   enabled = false, token null -> feed off (the function answers 404)
--   enabled = true,  token set  -> feed on; the token travels in the URL query

create table if not exists public.links_calendar_feed (
  id int primary key default 1 check (id = 1),
  token text,
  enabled boolean not null default false,
  rotated_at timestamptz
);

-- base64url of 32 bytes without padding = 43 characters.
alter table public.links_calendar_feed drop constraint if exists links_calendar_feed_token_format;
alter table public.links_calendar_feed
  add constraint links_calendar_feed_token_format
  check (token is null or token ~ '^[A-Za-z0-9_-]{43}$');

alter table public.links_calendar_feed drop constraint if exists links_calendar_feed_on_has_token;
alter table public.links_calendar_feed
  add constraint links_calendar_feed_on_has_token
  check (not enabled or token is not null);

alter table public.links_calendar_feed enable row level security;
revoke all on public.links_calendar_feed from public, anon, authenticated;
grant select on public.links_calendar_feed to service_role;

-- Editor: turn the feed on, or rotate the token ("Trocar link"). The token is
-- generated here (never by the client): 32 random bytes from two uuids, base64url.
create or replace function public.links_calendar_feed_enable()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token text;
begin
  if not public.links_is_editor() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  new_token := translate(
    encode(
      decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'),
      'base64'
    ),
    '+/=',
    '-_'
  );
  insert into public.links_calendar_feed (id, token, enabled, rotated_at)
  values (1, new_token, true, now())
  on conflict (id) do update
    set token = excluded.token, enabled = true, rotated_at = excluded.rotated_at;
  return new_token;
end;
$$;

-- Editor: turn the feed off. The old token stops working at once and is erased.
create or replace function public.links_calendar_feed_disable()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.links_is_editor() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.links_calendar_feed (id, token, enabled, rotated_at)
  values (1, null, false, now())
  on conflict (id) do update
    set token = null, enabled = false, rotated_at = excluded.rotated_at;
  return true;
end;
$$;

-- Editor: current state, so the sheet can show the link after a reload.
create or replace function public.links_calendar_feed_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.links_is_editor() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object('enabled', f.enabled, 'token', f.token)
    into result
    from public.links_calendar_feed f
   where f.id = 1;
  return coalesce(result, jsonb_build_object('enabled', false, 'token', null));
end;
$$;

revoke execute on function public.links_calendar_feed_enable() from public, anon;
revoke execute on function public.links_calendar_feed_disable() from public, anon;
revoke execute on function public.links_calendar_feed_get() from public, anon;
grant execute on function public.links_calendar_feed_enable() to authenticated;
grant execute on function public.links_calendar_feed_disable() to authenticated;
grant execute on function public.links_calendar_feed_get() to authenticated;
