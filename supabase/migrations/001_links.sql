-- Tabela de links externos
create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  url text not null check (url ~ '^https://'),
  label text not null check (char_length(label) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  icon_preset text check (icon_preset is null or icon_preset in (
    'instagram', 'github', 'linkedin', 'youtube', 'external-link', 'arrow-left'
  )),
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  sort_order integer not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists links_sort_order_unique on public.links (sort_order);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists links_updated_at on public.links;
create trigger links_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

alter table public.links enable row level security;

drop policy if exists "links_select_public" on public.links;
create policy "links_select_public"
  on public.links for select
  to anon, authenticated
  using (true);

drop policy if exists "links_insert_auth" on public.links;
create policy "links_insert_auth"
  on public.links for insert
  to authenticated
  with check (true);

drop policy if exists "links_update_auth" on public.links;
create policy "links_update_auth"
  on public.links for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "links_delete_auth" on public.links;
create policy "links_delete_auth"
  on public.links for delete
  to authenticated
  using (true);

-- Seed (link existente)
insert into public.links (url, label, description, icon_preset, sort_order)
values (
  'https://www.instagram.com/museudomar.aleixobelov/',
  'Museu do Mar',
  'Aleixobelov, AL',
  'instagram',
  0
)
on conflict do nothing;
