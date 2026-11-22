-- Phase 9: the Claude request queue.
--
-- Editors queue a request from the app ("pedir ao Claude"); a processor (the
-- Supabase MCP `execute_sql`, role postgres, which bypasses RLS) picks pending
-- rows, writes processando / pronto / erro with `result`, `error` and
-- `processed_at`, stamps links_ai_runs.last_run_at, and deletes aplicado /
-- descartado rows older than 90 days. The app never writes those columns: it
-- only reads the queue, inserts a pending row, and moves `status` to
-- aplicado or descartado (column-level grant on `status` only).
--
--   result formats: one draft | {v:1, drafts:[...]} | {v:1, agenda:[...]}
--   (validated client side, src/links/ai-requests.ts; anything else is an error)
--
-- Everything is gated by public.links_is_editor() (migration 017).

create table if not exists public.links_ai_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('instagram', 'refinar', 'agenda')),
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'pronto', 'erro', 'aplicado', 'descartado')),
  payload jsonb not null default '{}'
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  result jsonb check (result is null or octet_length(result::text) <= 70000),
  error text check (char_length(error) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists links_ai_requests_status_created_idx
  on public.links_ai_requests (status, created_at);

create or replace function public.links_ai_requests_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists links_ai_requests_touch on public.links_ai_requests;
create trigger links_ai_requests_touch
  before update on public.links_ai_requests
  for each row execute function public.links_ai_requests_touch();

-- The app (role authenticated) cannot forge who queued a request or when: the
-- insert trigger overwrites created_by / created_at / updated_at. The processor
-- (postgres) is not affected. The update trigger keeps `aplicado` for requests
-- that were `pronto`.
create or replace function public.links_ai_requests_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists links_ai_requests_before_insert on public.links_ai_requests;
create trigger links_ai_requests_before_insert
  before insert on public.links_ai_requests
  for each row execute function public.links_ai_requests_before_insert();

create or replace function public.links_ai_requests_guard_apply()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.status = 'aplicado' and old.status <> 'pronto' then
    raise exception 'only a ready request can be applied' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists links_ai_requests_guard_apply on public.links_ai_requests;
create trigger links_ai_requests_guard_apply
  before update on public.links_ai_requests
  for each row execute function public.links_ai_requests_guard_apply();

alter table public.links_ai_requests enable row level security;
revoke all on public.links_ai_requests from public, anon;
revoke all on public.links_ai_requests from authenticated;
grant select, insert on public.links_ai_requests to authenticated;
grant update (status) on public.links_ai_requests to authenticated;

drop policy if exists links_ai_requests_select on public.links_ai_requests;
create policy links_ai_requests_select on public.links_ai_requests
  for select to authenticated
  using (public.links_is_editor());

drop policy if exists links_ai_requests_insert on public.links_ai_requests;
create policy links_ai_requests_insert on public.links_ai_requests
  for insert to authenticated
  with check (
    public.links_is_editor()
    and status = 'pendente'
    and result is null
    and error is null
    and processed_at is null
  );

-- An editor can discard a pending / ready / failed request, or apply a ready one
-- (only `pronto` can become `aplicado`: the guard_apply trigger enforces it).
-- Rows already aplicado / descartado / processando are frozen for the app.
drop policy if exists links_ai_requests_update on public.links_ai_requests;
create policy links_ai_requests_update on public.links_ai_requests
  for update to authenticated
  using (public.links_is_editor() and status in ('pendente', 'pronto', 'erro'))
  with check (public.links_is_editor() and status in ('aplicado', 'descartado'));

-- "Última verificação": one row the processor stamps on every run.
create table if not exists public.links_ai_runs (
  id int primary key default 1 check (id = 1),
  last_run_at timestamptz
);

insert into public.links_ai_runs (id, last_run_at) values (1, null)
on conflict (id) do nothing;

alter table public.links_ai_runs enable row level security;
revoke all on public.links_ai_runs from public, anon;
revoke all on public.links_ai_runs from authenticated;
grant select on public.links_ai_runs to authenticated;

drop policy if exists links_ai_runs_select on public.links_ai_runs;
create policy links_ai_runs_select on public.links_ai_runs
  for select to authenticated
  using (public.links_is_editor());
