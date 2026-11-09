-- ============================================================================
-- Ролі: власник / технік. Частина 2 — ЗАХИСТ БАЗИ (RLS).
--
-- Після цього скрипта:
--   • власник (app_owner) має повний доступ до всіх таблиць, як і раніше;
--   • технік НЕ має прямого доступу до таблиць — лише функції get_my_* (без цін);
--   • без входу доступні лише: форма лікаря (функції), публічний чек
--     (get_public_order) і шаблон рахунку (InvoiceTemplate, лише читання).
--
-- Відкат — supabase/rollback/20261109d_roles_rls_rollback.sql
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'WorkOrder', 'clinic', 'doctor', 'technician', 'technician_service', 'technician_adjustment',
    'price_item', 'service_cost', 'order_template', 'salary_payment', 'salary_payment_order',
    'external_lab_order', 'external_provider', 'InvoiceTemplate', 'receipt_template', 'receipttemplate',
    'Clinics', 'Doctors', 'Technician'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- Прибираємо політики, що відкривали дані всім (у т.ч. без входу)
drop policy if exists "Allow public read for orders by id" on public."WorkOrder";
drop policy if exists "Enable all for price_item"          on public.price_item;
drop policy if exists "Allow public read access"           on public."Doctors";
drop policy if exists "Allow public insert access"         on public."Doctors";
drop policy if exists "Allow public update access"         on public."Doctors";
drop policy if exists "Allow public delete access"         on public."Doctors";
drop policy if exists "Allow authenticated users to insert receipt_template" on public.receipt_template;
drop policy if exists "Allow authenticated users to read receipt_template"   on public.receipt_template;
drop policy if exists "Allow authenticated users to update receipt_template" on public.receipt_template;
drop policy if exists "Allow authenticated users to insert ReceiptTemplate"  on public.receipttemplate;
drop policy if exists "Allow authenticated users to read ReceiptTemplate"    on public.receipttemplate;
drop policy if exists "Allow authenticated users to update ReceiptTemplate"  on public.receipttemplate;

-- Шаблон рахунку потрібен публічному чеку (лише читання, як і було)
-- політика "Allow public read for invoice templates" залишається без змін

notify pgrst, 'reload schema';
