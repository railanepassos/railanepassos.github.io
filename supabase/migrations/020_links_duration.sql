-- Duração: how much of a day an item takes (optional).
--
-- duration: null, or one of 'rapido' (up to 2h), 'meio-periodo', 'dia-inteiro'.
-- The values are mirrored in src/links/duration.ts and DRAFT_LIMITS.durations
-- (sync tests in tests/unit/duration.test.ts). No policy change: the
-- row-level policies on public.links already cover the new column.
alter table public.links
  add column if not exists duration text;

alter table public.links drop constraint if exists links_duration_valid;
alter table public.links
  add constraint links_duration_valid
  check (duration in ('rapido', 'meio-periodo', 'dia-inteiro'));
