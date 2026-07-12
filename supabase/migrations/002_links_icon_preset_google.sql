-- Allow inferred Google Maps / Google host icons.
alter table public.links drop constraint if exists links_icon_preset_check;

alter table public.links
  add constraint links_icon_preset_check
  check (
    icon_preset is null
    or icon_preset in (
      'instagram',
      'github',
      'linkedin',
      'youtube',
      'google',
      'external-link',
      'arrow-left'
    )
  );
