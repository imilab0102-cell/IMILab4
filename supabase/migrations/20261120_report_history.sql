-- ============================================================================
-- Історія сформованих звітів + позначка «звіт оплачено» (змінює оплату нарядів).
-- Нова таблиця; наявні дані не змінюються.
-- ============================================================================

create table if not exists public.report_history (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  period_label text,
  date_from    date,
  date_to      date,
  clinic_id    text,
  clinic_name  text,
  doctor_name  text,
  currency     text,
  order_ids    bigint[] not null default '{}',
  orders_count int not null default 0,
  totals       jsonb not null default '{}'::jsonb,   -- {work, paid, debt} у валюті звіту
  format       text,                                 -- pdf | image | excel | manual
  status       text not null default 'Не оплачено' check (status in ('Не оплачено', 'Оплачено')),
  paid_at      timestamptz,
  note         text
);

create index if not exists report_history_created_idx on public.report_history (created_at desc);

alter table public.report_history enable row level security;
drop policy if exists "owner_all" on public.report_history;
create policy "owner_all" on public.report_history
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Позначити звіт оплаченим: усі наряди звіту отримують «Оплачено» (атомарно)
create or replace function public.mark_report_paid(p_id uuid)
returns int language plpgsql security definer
set search_path = public
as $$
declare v_ids bigint[]; v_n int;
begin
  if not public.is_owner() then raise exception 'no_permission'; end if;
  select order_ids into v_ids from public.report_history where id = p_id for update;
  if v_ids is null then raise exception 'report_not_found'; end if;
  update public."WorkOrder" set payment_status = 'Оплачено'
   where id = any(v_ids) and coalesce(payment_status, '') <> 'Оплачено';
  get diagnostics v_n = row_count;
  update public.report_history set status = 'Оплачено', paid_at = now() where id = p_id;
  return v_n;
end;
$$;

revoke all on function public.mark_report_paid(uuid) from public;
grant execute on function public.mark_report_paid(uuid) to authenticated;

notify pgrst, 'reload schema';
