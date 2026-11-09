-- ВІДКАТ захисту бази (повертає стан до 20261109d_roles_rls.sql).
-- Запускати лише якщо після увімкнення захисту щось перестало працювати.

do $$
declare
  t text;
  tables text[] := array[
    'WorkOrder', 'clinic', 'doctor', 'technician', 'technician_service', 'technician_adjustment',
    'price_item', 'service_cost', 'order_template', 'salary_payment', 'salary_payment_order',
    'external_lab_order', 'external_provider', 'InvoiceTemplate', 'Clinics', 'Technician'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

-- Таблиці, де RLS був увімкнений і до змін — повертаємо попередні політики
drop policy if exists "owner_all" on public."Doctors";
drop policy if exists "owner_all" on public.receipt_template;
drop policy if exists "owner_all" on public.receipttemplate;

create policy "Allow public read access"   on public."Doctors" for select using (true);
create policy "Allow public insert access" on public."Doctors" for insert with check (true);
create policy "Allow public update access" on public."Doctors" for update using (true);
create policy "Allow public delete access" on public."Doctors" for delete using (true);

create policy "Allow authenticated users to insert receipt_template" on public.receipt_template for insert to authenticated with check (true);
create policy "Allow authenticated users to read receipt_template"   on public.receipt_template for select to authenticated using (true);
create policy "Allow authenticated users to update receipt_template" on public.receipt_template for update to authenticated using (true);

create policy "Allow authenticated users to insert ReceiptTemplate" on public.receipttemplate for insert to authenticated with check (true);
create policy "Allow authenticated users to read ReceiptTemplate"   on public.receipttemplate for select to authenticated using (true);
create policy "Allow authenticated users to update ReceiptTemplate" on public.receipttemplate for update to authenticated using (true);

create policy "Allow public read for orders by id" on public."WorkOrder" for select using (true);
create policy "Enable all for price_item" on public.price_item for all using (true);

notify pgrst, 'reload schema';
