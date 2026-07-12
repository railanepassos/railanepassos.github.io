-- Deck: wishlist vs done + memory fields
alter table public.links
  add column if not exists status text not null default 'wishlist',
  add column if not exists priority integer not null default 0,
  add column if not exists want_again boolean not null default false,
  add column if not exists image_url text,
  add column if not exists note text,
  add column if not exists completed_at timestamptz;

alter table public.links drop constraint if exists links_status_check;
alter table public.links
  add constraint links_status_check
  check (status in ('wishlist', 'done'));

alter table public.links drop constraint if exists links_image_url_https;
alter table public.links
  add constraint links_image_url_https
  check (image_url is null or image_url ~ '^https://');

alter table public.links drop constraint if exists links_note_len;
alter table public.links
  add constraint links_note_len
  check (note is null or char_length(note) <= 500);
