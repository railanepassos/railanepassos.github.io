-- Widen the note field so it can hold a fuller description of the place
-- (why it was saved, region, season, etc.) instead of a short one-liner.
alter table public.links drop constraint if exists links_description_check;

alter table public.links
  add constraint links_description_check
  check (description is null or char_length(description) <= 2000);
