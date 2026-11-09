-- ============================================================================
-- Ролі: власник / технік. Частина 1 — лише ДОДАЄ функції та колонку email.
-- Нічого не блокує і не змінює наявні дані.
-- ============================================================================

-- Власники лабораторії (повний доступ)
create table if not exists public.app_owner (
  email text primary key
);
alter table public.app_owner enable row level security;   -- читають лише функції нижче
insert into public.app_owner (email) values ('imilab0102@gmail.com') on conflict do nothing;

-- Email техніка для входу через Google
alter table public.technician add column if not exists email text;
create unique index if not exists technician_email_unique
  on public.technician (lower(email)) where email is not null and email <> '';

-- ─── Хто я ───────────────────────────────────────────────────────────────────
-- Email беремо з auth.users і лише ПІДТВЕРДЖЕНИЙ (Google підтверджує автоматично),
-- щоб ніхто не міг зареєструватися паролем на чужу пошту
create or replace function public.auth_email()
returns text language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select lower(u.email) from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
  ), '');
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.app_owner where lower(email) = public.auth_email() and public.auth_email() <> '');
$$;

create or replace function public.current_technician_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select t.id from public.technician t
  where public.auth_email() <> ''
    and lower(coalesce(t.email, '')) = public.auth_email()
    and coalesce(t.is_active, true)
  limit 1;
$$;

-- Роль поточного користувача: owner | technician | none
create or replace function public.get_my_role()
returns table (role text, technician_id uuid, full_name text, specialization text)
language sql stable security definer
set search_path = public
as $$
  select 'owner'::text, null::uuid, null::text, null::text where public.is_owner()
  union all
  select 'technician', t.id, t.full_name, t.specialization
  from public.technician t
  where not public.is_owner() and t.id = public.current_technician_id()
  limit 1;
$$;

-- ─── Допоміжне: items може бути масивом або рядком з JSON ───────────────────
create or replace function public._items_array(p jsonb)
returns jsonb language plpgsql immutable
as $$
begin
  if p is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p) = 'array' then return p; end if;
  if jsonb_typeof(p) = 'string' then
    begin
      p := (p #>> '{}')::jsonb;
      if jsonb_typeof(p) = 'array' then return p; end if;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function public._num(t text)
returns numeric language sql immutable
as $$ select case when t ~ '^\s*-?\d+([.,]\d+)?\s*$' then replace(trim(t), ',', '.')::numeric end $$;

-- ─── Кабінет техніка: лише свої наряди, БЕЗ фінансів лабораторії/клініки ────
create or replace function public.get_my_orders()
returns table (
  id text, order_number text, creation_date timestamptz, due_date date, completion_date date,
  status text, patient_name text, patient_age int, patient_gender text,
  clinic_name text, doctor_name text, tooth_color text, tooth_shades text,
  selected_teeth text[], notes text, file_urls text, items jsonb, my_pay numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    w.id::text, w.order_number, w.creation_date, w.due_date, w.completion_date,
    w.status, w.patient_name, w.patient_age, w.patient_gender,
    w.clinic_name, w.doctor_name, w.tooth_color, w.tooth_shades,
    w.selected_teeth, w.notes, w.file_urls,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_name', coalesce(i->>'service_name', i->>'name'),
        'category', i->>'category',
        'teeth_numbers', coalesce(i->>'teeth_numbers', i->'teeth'->>0),
        'quantity', coalesce(public._num(i->>'quantity'), 1),
        'technician_pay', coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0)
      ))
      from jsonb_array_elements(public._items_array(w.items)) i
      where jsonb_typeof(i) = 'object'
    ), '[]'::jsonb),
    coalesce((
      select sum(
        coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0)
        * coalesce(public._num(i->>'quantity'), 1))
      from jsonb_array_elements(public._items_array(w.items)) i
      where jsonb_typeof(i) = 'object'
    ), 0)
  from public."WorkOrder" w
  where public.current_technician_id() is not null
    and w.technician_id = public.current_technician_id()::text
  order by w.creation_date desc nulls last;
$$;

-- Технік може змінювати лише статус своїх нарядів
create or replace function public.set_my_order_status(p_id text, p_status text)
returns void language plpgsql security definer
set search_path = public
as $$
declare v_tech uuid := public.current_technician_id();
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if p_status not in ('В роботі', 'На примірці', 'Готовий') then raise exception 'status_not_allowed'; end if;
  update public."WorkOrder"
     set status = p_status
   where id::text = p_id and technician_id = v_tech::text
     and coalesce(status, '') not in ('Зданий', 'Скасований');
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
  order by a.created_at desc;
$$;

-- ─── Публічний чек наряду (QR на чеку): без собівартості та прибутку ────────
create or replace function public.get_public_order(p_id text)
returns jsonb language sql stable security definer
set search_path = public
as $$
  select (to_jsonb(w)
          - 'net_profit' - 'technician_total_pay' - 'expenses'
          - 'technician_id' - 'technician_name' - 'user_id'
          - 'technician_service_id' - 'exchange_rate')
         || jsonb_build_object('items', coalesce((
              select jsonb_agg(i - 'technician_pay' - 'technician_price' - 'cost_info' - 'technician_service_id')
              from jsonb_array_elements(public._items_array(w.items)) i
              where jsonb_typeof(i) = 'object'), '[]'::jsonb))
  from public."WorkOrder" w
  where w.id::text = p_id;
$$;

revoke all on function public.auth_email()                     from public;
revoke all on function public.is_owner()                       from public;
revoke all on function public.current_technician_id()          from public;
revoke all on function public.get_my_role()                    from public;
revoke all on function public.get_my_orders()                  from public;
revoke all on function public.set_my_order_status(text, text)  from public;
revoke all on function public.get_my_services()                from public;
revoke all on function public.get_my_salary_payments()         from public;
revoke all on function public.get_my_adjustments()             from public;
revoke all on function public.get_public_order(text)           from public;

grant execute on function public.auth_email()                    to authenticated;
grant execute on function public.is_owner()                      to authenticated;
grant execute on function public.current_technician_id()         to authenticated;
grant execute on function public.get_my_role()                   to authenticated;
grant execute on function public.get_my_orders()                 to authenticated;
grant execute on function public.set_my_order_status(text, text) to authenticated;
grant execute on function public.get_my_services()               to authenticated;
grant execute on function public.get_my_salary_payments()        to authenticated;
grant execute on function public.get_my_adjustments()            to authenticated;
grant execute on function public.get_public_order(text)          to anon, authenticated;

notify pgrst, 'reload schema';
