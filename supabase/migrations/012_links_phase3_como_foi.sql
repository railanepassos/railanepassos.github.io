-- Phase 3: "Como foi" — what the visit was like (rating, impressions, lessons
-- learned and a link to the memory video/post).
--
-- Every column is optional and null by default, so existing rows stay valid.
-- RLS needs no change: the policies on public.links are row-level, so they
-- already cover the new columns. Unmarking a place as done only changes
-- status/completed_at; these columns are never touched by it.
alter table public.links
  add column if not exists rating smallint,
  add column if not exists impressions text,
  add column if not exists lessons text[],
  add column if not exists memory_url text;

-- Limits are mirrored in src/links/review.ts (REVIEW_LIMITS).
alter table public.links drop constraint if exists links_rating_range;
alter table public.links
  add constraint links_rating_range
  check (rating is null or (rating between 1 and 5));

alter table public.links drop constraint if exists links_impressions_len;
alter table public.links
  add constraint links_impressions_len
  check (impressions is null or char_length(impressions) <= 5000);

-- Reuses the per-element helper from migration 011 (max 20 lessons, each 1..300
-- characters).
alter table public.links drop constraint if exists links_lessons_valid;
alter table public.links
  add constraint links_lessons_valid
  check (public.links_text_array_valid(lessons, 20, 300));

alter table public.links drop constraint if exists links_memory_url_https;
alter table public.links
  add constraint links_memory_url_https
  check (memory_url is null or (memory_url ~ '^https://' and char_length(memory_url) <= 2000));
