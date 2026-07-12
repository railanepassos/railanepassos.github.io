-- Add parque category (split from ponto-turistico keyword).
alter table public.links drop constraint if exists links_category_check;

alter table public.links
  add constraint links_category_check
  check (
    category is null
    or category in (
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
    )
  );
