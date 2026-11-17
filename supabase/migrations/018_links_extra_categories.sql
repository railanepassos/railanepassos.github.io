-- Extra categories: an item keeps its main `category` (card colour, icon,
-- deck) and may carry up to 3 more, used only for filters, counts and draw.
alter table public.links
  add column if not exists extra_categories text[] not null default '{}';

-- CHECK constraints cannot hold subqueries, so the rules live in an immutable
-- helper: every element is in the allowed set of links_category_check, at most
-- 3 elements, no duplicates, and none equals the main category.
create or replace function public.links_extra_categories_ok(extras text[], main text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    extras is not null
    and cardinality(extras) <= 3
    and extras <@ array[
      'museu',
      'evento',
      'restaurante',
      'bar',
      'cafeteria',
      'trilha',
      'praca',
      'parque',
      'praia',
      'ponto-turistico',
      'passeio',
      'outro'
    ]::text[]
    and cardinality(extras) = (select count(distinct e) from unnest(extras) as e)
    and (main is null or not (main = any (extras)))
$$;

-- Only meant for the CHECK constraint: not callable by anon (it would
-- otherwise be exposed as RPC); the roles that write rows keep execute.
revoke execute on function public.links_extra_categories_ok(text[], text) from public, anon;
grant execute on function public.links_extra_categories_ok(text[], text) to authenticated, service_role;

alter table public.links drop constraint if exists links_extra_categories_check;

alter table public.links
  add constraint links_extra_categories_check
  check (public.links_extra_categories_ok(extra_categories, category));
