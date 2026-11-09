-- ============================================================================
-- Технік з правом «Зовнішні лабораторії» працює зі сторінкою зовнішніх лаб
-- так само, як власник (усі лабораторії та замовлення, з цінами).
-- Політики діють, коли на таблицях увімкнено захист (RLS).
-- ============================================================================

drop policy if exists "tech_external_all" on public.external_provider;
create policy "tech_external_all" on public.external_provider
  for all to authenticated
  using (public.tech_perm('add_external')) with check (public.tech_perm('add_external'));

drop policy if exists "tech_external_all" on public.external_lab_order;
create policy "tech_external_all" on public.external_lab_order
  for all to authenticated
  using (public.tech_perm('add_external')) with check (public.tech_perm('add_external'));

-- довідники для форми замовлення (лише читання)
drop policy if exists "tech_external_read" on public.price_item;
create policy "tech_external_read" on public.price_item
  for select to authenticated using (public.tech_perm('add_external'));

drop policy if exists "tech_external_read" on public.technician;
create policy "tech_external_read" on public.technician
  for select to authenticated using (public.tech_perm('add_external'));

drop policy if exists "tech_external_read" on public.technician_service;
create policy "tech_external_read" on public.technician_service
  for select to authenticated using (public.tech_perm('add_external'));

notify pgrst, 'reload schema';
