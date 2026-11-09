-- ============================================================================
-- Права техніків, які налаштовує власник. Додає колонку permissions і
-- оновлює функції кабінету техніка. Дані нарядів не змінюються.
-- ============================================================================

alter table public.technician add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Права за замовчуванням (якщо власник нічого не міняв)
create or replace function public.tech_default_permissions()
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'change_status',     true,   -- змінювати статус своїх нарядів
    'add_notes',         false,  -- дописувати примітки до своїх нарядів
    'see_earnings',      true,   -- бачити свій заробіток і виплати
    'see_services',      true,   -- бачити свої ставки
    'see_all_orders',    false,  -- бачити всі наряди лабораторії (без цін)
    'see_patient',       true,   -- бачити ПІБ пацієнта
    'see_clinic_doctor', true,   -- бачити клініку і лікаря
    'see_files',         true    -- бачити файли/фото
  );
$$;

create or replace function public.my_permissions()
returns jsonb language sql stable security definer
set search_path = public
as $$
  select public.tech_default_permissions() || coalesce(
    (select t.permissions from public.technician t where t.id = public.current_technician_id()),
    '{}'::jsonb);
$$;

create or replace function public.tech_perm(p_key text)
returns boolean language sql stable security definer
set search_path = public
as $$
  select coalesce((public.my_permissions()->>p_key)::boolean, false);
$$;

-- ─── Роль + права ────────────────────────────────────────────────────────────
drop function if exists public.get_my_role();
create function public.get_my_role()
returns table (role text, technician_id uuid, full_name text, specialization text, permissions jsonb)
language sql stable security definer
set search_path = public
as $$
  select 'owner'::text, null::uuid, null::text, null::text, null::jsonb where public.is_owner()
  union all
  select 'technician', t.id, t.full_name, t.specialization, public.my_permissions()
  from public.technician t
  where not public.is_owner() and t.id = public.current_technician_id()
  limit 1;
$$;

-- ─── Наряди техніка з урахуванням прав ──────────────────────────────────────
drop function if exists public.get_my_orders();
create function public.get_my_orders()
returns table (
  id text, order_number text, creation_date timestamptz, due_date date, completion_date date,
  status text, patient_name text, patient_age int, patient_gender text,
  clinic_name text, doctor_name text, tooth_color text, tooth_shades text,
  selected_teeth text[], notes text, file_urls text, items jsonb, my_pay numeric,
  is_mine boolean, technician_name text
)
language sql stable security definer
set search_path = public
as $$
  with me as (
    select public.current_technician_id() as id,
           public.tech_perm('see_all_orders')    as all_orders,
           public.tech_perm('see_patient')       as patient,
           public.tech_perm('see_clinic_doctor') as clinic,
           public.tech_perm('see_files')         as files,
           public.tech_perm('see_earnings')      as earnings
  )
  select
    w.id::text, w.order_number, w.creation_date, w.due_date, w.completion_date, w.status,
    case when me.patient then w.patient_name else 'Пацієнт приховано' end,
    case when me.patient then w.patient_age end,
    w.patient_gender,
    case when me.clinic then w.clinic_name end,
    case when me.clinic then w.doctor_name end,
    w.tooth_color, w.tooth_shades, w.selected_teeth, w.notes,
    case when me.files then w.file_urls end,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_name', coalesce(i->>'service_name', i->>'name'),
        'category', i->>'category',
        'teeth_numbers', coalesce(i->>'teeth_numbers', i->'teeth'->>0),
        'quantity', coalesce(public._num(i->>'quantity'), 1),
        'technician_pay', case when me.earnings and w.technician_id = me.id::text
          then coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0) else 0 end
      ))
      from jsonb_array_elements(public._items_array(w.items)) i
      where jsonb_typeof(i) = 'object'
    ), '[]'::jsonb),
    case when me.earnings and w.technician_id = me.id::text then coalesce((
      select sum(
        coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0)
        * coalesce(public._num(i->>'quantity'), 1))
      from jsonb_array_elements(public._items_array(w.items)) i
      where jsonb_typeof(i) = 'object'
    ), 0) else 0 end,
    w.technician_id = me.id::text,
    case when w.technician_id = me.id::text then null else w.technician_name end
  from public."WorkOrder" w, me
  where me.id is not null
    and (w.technician_id = me.id::text or me.all_orders)
  order by w.creation_date desc nulls last;
$$;

create or replace function public.set_my_order_status(p_id text, p_status text)
returns void language plpgsql security definer
set search_path = public
as $$
declare v_tech uuid := public.current_technician_id();
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('change_status') then raise exception 'no_permission'; end if;
  if p_status not in ('В роботі', 'На примірці', 'Готовий') then raise exception 'status_not_allowed'; end if;
  update public."WorkOrder"
     set status = p_status
   where id::text = p_id and technician_id = v_tech::text
     and coalesce(status, '') not in ('Зданий', 'Скасований');
  if not found then raise exception 'order_not_found'; end if;
end;
$$;

-- Технік дописує примітку до свого наряду (з підписом і часом)
create or replace function public.add_my_order_note(p_id text, p_text text)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  v_tech uuid := public.current_technician_id();
  v_name text;
  v_text text := left(trim(coalesce(p_text, '')), 1000);
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('add_notes') then raise exception 'no_permission'; end if;
  if v_text = '' then raise exception 'empty_note'; end if;
  select full_name into v_name from public.technician where id = v_tech;
  update public."WorkOrder"
     set notes = concat_ws(E'\n', nullif(notes, ''),
           format('[%s, %s] %s', coalesce(v_name, 'Технік'),
                  to_char(now() at time zone 'Europe/Kyiv', 'DD.MM HH24:MI'), v_text))
   where id::text = p_id and technician_id = v_tech::text;
  if not found then raise exception 'order_not_found'; end if;
end;
$$;

create or replace function public.get_my_services()
returns table (id uuid, service_name text, category text, technician_pay numeric)
language sql stable security definer
set search_path = public
as $$
  select s.id, s.service_name, s.category, s.technician_pay
  from public.technician_service s
  where s.technician_id = public.current_technician_id()
    and public.tech_perm('see_services')
  order by s.category, s.service_name;
$$;

create or replace function public.get_my_salary_payments()
returns table (id bigint, period_start date, period_end date, total_amount numeric, orders_count int, note text, paid_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.period_start, p.period_end, p.total_amount, p.orders_count, p.note, p.paid_at
  from public.salary_payment p
  where p.technician_id = public.current_technician_id()
    and public.tech_perm('see_earnings')
  order by p.paid_at desc nulls last;
$$;

create or replace function public.get_my_adjustments()
returns table (id uuid, created_at timestamptz, description text, amount numeric, is_paid boolean)
language sql stable security definer
set search_path = public
as $$
  select a.id, a.created_at, a.description, a.amount, a.is_paid
  from public.technician_adjustment a
  where a.technician_id = public.current_technician_id()
    and public.tech_perm('see_earnings')
  order by a.created_at desc;
$$;

revoke all on function public.my_permissions()               from public;
revoke all on function public.tech_perm(text)                from public;
revoke all on function public.get_my_role()                  from public;
revoke all on function public.get_my_orders()                from public;
revoke all on function public.add_my_order_note(text, text)  from public;
grant execute on function public.my_permissions()              to authenticated;
grant execute on function public.tech_perm(text)               to authenticated;
grant execute on function public.get_my_role()                 to authenticated;
grant execute on function public.get_my_orders()               to authenticated;
grant execute on function public.add_my_order_note(text, text) to authenticated;

notify pgrst, 'reload schema';
