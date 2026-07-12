-- Experience category (inferred from title/note/url keywords in the app).
alter table public.links
  add column if not exists category text;

alter table public.links drop constraint if exists links_category_check;

alter table public.links
  add constraint links_category_check
  check (
    category is null
    or category in (
      'museu',
      'evento',
      'restaurante',
      'trilha',
      'praca',
      'praia',
      'ponto-turistico',
      'passeio',
      'outro'
    )
  );
