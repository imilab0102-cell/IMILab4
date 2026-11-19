-- ============================================================================
-- «Оплачено» зі звіту одразу ставить наряду статус «Зданий»
-- (і дату завершення, якщо її ще немає). Скасовані наряди не змінюються.
-- ============================================================================

create or replace function public.mark_orders_paid(p_ids bigint[])
returns int language plpgsql security definer
set search_path = public
as $$
declare v_n int;
begin
  if not public.is_owner() then raise exception 'no_permission'; end if;
  update public."WorkOrder"
     set payment_status  = 'Оплачено',
         status          = 'Зданий',
         completion_date = coalesce(completion_date, current_date)
   where id = any(coalesce(p_ids, '{}'))
     and coalesce(status, '') <> 'Скасований'
     and (coalesce(payment_status, '') <> 'Оплачено' or coalesce(status, '') <> 'Зданий');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.mark_report_paid(p_id uuid)
returns int language plpgsql security definer
set search_path = public
as $$
declare v_ids bigint[]; v_n int;
begin
  if not public.is_owner() then raise exception 'no_permission'; end if;
  select order_ids into v_ids from public.report_history where id = p_id for update;
  if v_ids is null then raise exception 'report_not_found'; end if;
  v_n := public.mark_orders_paid(v_ids);
  update public.report_history set status = 'Оплачено', paid_at = now() where id = p_id;
  return v_n;
end;
$$;

revoke all on function public.mark_orders_paid(bigint[]) from public;
revoke all on function public.mark_report_paid(uuid)     from public;
grant execute on function public.mark_orders_paid(bigint[]) to authenticated;
grant execute on function public.mark_report_paid(uuid)     to authenticated;

notify pgrst, 'reload schema';
