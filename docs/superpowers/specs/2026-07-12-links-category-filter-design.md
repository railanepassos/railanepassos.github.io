# Design: Filtro por categoria (mobile-first)

**Date:** 2026-07-12  
**Status:** Approved (approach A)  
**Surface:** `/p/a8f3k2/` admin autenticado

## Behavior

- Botão **Filtrar** na toolbar (ao lado de Nova / Sair).
- Abre bottom sheet / tela com **Todas** + categorias fechadas.
- Uma categoria ativa por vez; **Todas** limpa o filtro.
- Badge/indicador no botão quando filtro ≠ Todas.
- Lista admin mostra só itens cuja `resolveCategory(link)` bate.
- Estado vazio: “Nenhuma experiência nesta categoria.”
- Sem custo Supabase (filtro client-side).

## Out of scope

- Multi-select; filtros no modo público; persistência do filtro entre sessões.
