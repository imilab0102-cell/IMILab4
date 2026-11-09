-- ============================================================================
-- Технік з правом «Наряди як у власника» працює зі сторінкою нарядів
-- так само, як власник (усі наряди з цінами, створення/редагування/видалення).
-- Політики діють, коли на таблицях увімкнено захист (RLS).
-- ============================================================================

drop policy if exists "tech_full_orders_all" on public."WorkOrder";
create policy "tech_full_orders_all" on public."WorkOrder"
  for all to authenticated
  using (public.tech_perm('full_orders')) with check (public.tech_perm('full_orders'));

do $$
declare t text;
begin
  foreach t in array array['clinic', 'doctor', 'technician', 'price_item', 'technician_service',
                           'service_cost', 'order_template', 'receipt_template'] loop
    execute format('drop policy if exists "tech_full_orders_read" on public.%I', t);
    execute format('create policy "tech_full_orders_read" on public.%I for select to authenticated using (public.tech_perm(''full_orders''))', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
