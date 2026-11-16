-- Phase 2: place details (cost, city, address), dossier, itinerary, source
-- post, photo pose references, tags and people.
--
-- Every column is optional and null by default, so existing rows stay valid.
-- RLS needs no change: the policies on public.links are row-level (insert /
-- update / delete for authenticated users, select via links_select_auth from
-- 009), so they already cover the new columns.
alter table public.links
  add column if not exists cost_text text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists dossier text,
  add column if not exists itinerary text,
  add column if not exists source_url text,
  add column if not exists pose_refs jsonb,
  add column if not exists tags text[],
  add column if not exists people text[];

-- CHECK constraints cannot contain subqueries, so the per-element rules live in
-- small immutable helpers (same limits are mirrored in src/links/more-fields.ts).
create or replace function public.links_text_array_valid(
  items text[],
  max_items integer,
  max_len integer
) returns boolean
language sql
immutable
as $$
  select items is null
    or (
      cardinality(items) <= max_items
      and not exists (
        select 1
        from unnest(items) as item
        where item is null or char_length(item) < 1 or char_length(item) > max_len
      )
    );
$$;

-- pose_refs: array of {url?: https string, note?: string <= 500}, max 30 items.
create or replace function public.links_pose_refs_valid(refs jsonb)
returns boolean
language sql
immutable
as $$
  select refs is null
    or (
      jsonb_typeof(refs) = 'array'
      and jsonb_array_length(refs) <= 30
      and not exists (
        select 1
        from jsonb_array_elements(refs) as pose
        where jsonb_typeof(pose) <> 'object'
          or (pose ? 'url' and (jsonb_typeof(pose -> 'url') <> 'string' or (pose ->> 'url') !~ '^https://'))
          or (pose ? 'note' and (jsonb_typeof(pose -> 'note') <> 'string' or char_length(pose ->> 'note') > 500))
      )
    );
$$;

alter table public.links drop constraint if exists links_cost_text_len;
alter table public.links
  add constraint links_cost_text_len
  check (cost_text is null or char_length(cost_text) <= 200);

alter table public.links drop constraint if exists links_city_len;
alter table public.links
  add constraint links_city_len
  check (city is null or char_length(city) <= 120);

alter table public.links drop constraint if exists links_address_len;
alter table public.links
  add constraint links_address_len
  check (address is null or char_length(address) <= 300);

alter table public.links drop constraint if exists links_dossier_len;
alter table public.links
  add constraint links_dossier_len
  check (dossier is null or char_length(dossier) <= 5000);

alter table public.links drop constraint if exists links_itinerary_len;
alter table public.links
  add constraint links_itinerary_len
  check (itinerary is null or char_length(itinerary) <= 5000);

alter table public.links drop constraint if exists links_source_url_https;
alter table public.links
  add constraint links_source_url_https
  check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 2000));

alter table public.links drop constraint if exists links_pose_refs_valid;
alter table public.links
  add constraint links_pose_refs_valid
  check (public.links_pose_refs_valid(pose_refs));

alter table public.links drop constraint if exists links_tags_valid;
alter table public.links
  add constraint links_tags_valid
  check (public.links_text_array_valid(tags, 30, 40));

alter table public.links drop constraint if exists links_people_valid;
alter table public.links
  add constraint links_people_valid
  check (public.links_text_array_valid(people, 30, 80));
