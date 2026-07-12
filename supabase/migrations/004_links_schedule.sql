-- Planned visit window for an experience (editor-set).
alter table public.links
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

alter table public.links drop constraint if exists links_schedule_order;

alter table public.links
  add constraint links_schedule_order
  check (
    (scheduled_start is null and scheduled_end is null)
    or (
      scheduled_start is not null
      and scheduled_end is not null
      and scheduled_end > scheduled_start
    )
  );
