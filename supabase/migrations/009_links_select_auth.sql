-- Experiences are editor-private: SELECT only for authenticated sessions.
drop policy if exists "links_select_public" on public.links;

drop policy if exists "links_select_auth" on public.links;
create policy "links_select_auth"
  on public.links for select
  to authenticated
  using (true);
