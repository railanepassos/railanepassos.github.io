-- Phase 9 follow-up: retention of the Claude request queue as a function.
--
-- The scheduled processor (Supabase MCP `execute_sql`, role postgres) runs
-- unattended. The MCP asks a human to confirm any raw DELETE, so an unattended
-- round could never purge. It calls `select public.links_ai_requests_purge()`
-- instead, which deletes aplicado / descartado requests older than 90 days
-- (spec: 90-day retention) and returns how many it removed.
--
-- Not for the app: execute is revoked from public, anon and authenticated.

create or replace function public.links_ai_requests_purge()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.links_ai_requests
   where status in ('aplicado', 'descartado')
     and updated_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.links_ai_requests_purge() from public, anon, authenticated;
