-- Editor allowlist for public.links.
--
-- Why: Supabase email signup may be open, and until now every policy on
-- public.links granted ALL authenticated users full access (using (true)).
-- Anyone who signed up could read and write private rows. From here on only
-- users listed in public.links_editors pass RLS. (Signup is also disabled in
-- the dashboard; this is defense in depth.)
--
-- AFTER APPLYING, seed the editors ONCE in the Supabase dashboard SQL editor
-- (never commit real emails or user ids; this repo is public):
--
--   insert into public.links_editors (user_id)
--   select id from auth.users where email in ('<editor1>', '<editor2>');
--
-- Until that seed runs, nobody can read or write public.links through the API.

create table if not exists public.links_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on, deliberately NO policies: only the SECURITY DEFINER function below
-- (and the service role / dashboard) can read it.
alter table public.links_editors enable row level security;
revoke all on public.links_editors from anon, authenticated;

create or replace function public.links_is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.links_editors e where e.user_id = auth.uid())
$$;

revoke execute on function public.links_is_editor() from public, anon;
grant execute on function public.links_is_editor() to authenticated;

-- public.links: same policy names, now gated by the allowlist. The editor RPCs
-- links_plan_share_enable/disable (014) are SECURITY INVOKER, so they inherit
-- the update policy. The public token functions (014-016) are SECURITY DEFINER
-- and are untouched.
drop policy if exists "links_select_auth" on public.links;
create policy "links_select_auth"
  on public.links for select
  to authenticated
  using (public.links_is_editor());

drop policy if exists "links_insert_auth" on public.links;
create policy "links_insert_auth"
  on public.links for insert
  to authenticated
  with check (public.links_is_editor());

drop policy if exists "links_update_auth" on public.links;
create policy "links_update_auth"
  on public.links for update
  to authenticated
  using (public.links_is_editor())
  with check (public.links_is_editor());

drop policy if exists "links_delete_auth" on public.links;
create policy "links_delete_auth"
  on public.links for delete
  to authenticated
  using (public.links_is_editor());
