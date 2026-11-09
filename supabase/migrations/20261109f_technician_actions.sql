-- ============================================================================
-- Кабінет техніка: повний заробіток (наряди + зовнішні лаби + коригування)
-- і нові права: створювати наряди, додавати роботи в зовнішні лаби,
-- коригувати свою зарплату. Лише додає/оновлює функції.
-- ============================================================================

create or replace function public.tech_default_permissions()
returns jsonb language sql immutable
as $$
  select jsonb_build_object(
    'change_status',     true,
    'add_notes',         false,
    'see_earnings',      true,
    'see_services',      true,
    'see_all_orders',    false,
    'see_patient',       true,
    'see_clinic_doctor', true,
    'see_files',         true,
    'create_orders',     false,  -- створювати нові наряди (без цін; ціни перевіряє власник)
    'add_external',      false,  -- додавати свої роботи в зовнішні лабораторії
    'adjust_salary'    , false   -- додавати коригування до своєї зарплати
  );
$$;

-- ─── Наряди: + дата і ознака виплати по кожній позиції (для заробітку) ─────
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
        'date', left(i->>'date', 10),
        'is_paid', (i->>'is_paid') = 'true' or nullif(i->>'salary_payment_id', '') is not null,
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

-- ─── Зовнішні лабораторії: мої роботи ───────────────────────────────────────
create or replace function public.get_my_external_orders()
returns table (id int, order_date date, lab_name text, status text, notes text, items jsonb, my_pay numeric, paid_amount numeric)
language sql stable security definer
set search_path = public
as $$
  with me as (select public.current_technician_id() as id, public.tech_perm('see_earnings') as earnings)
  select e.id, e.order_date, e.lab_name, e.status, e.notes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_name', i->>'service_name',
        'quantity', coalesce(public._num(i->>'quantity'), 1),
        'technician_pay', case when me.earnings then coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0) else 0 end))
      from jsonb_array_elements(public._items_array(e.items)) i
      where jsonb_typeof(i) = 'object'
        and coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0) > 0
    ), '[]'::jsonb),
    case when me.earnings then coalesce((
      select sum(coalesce(public._num(i->>'technician_pay'), public._num(i->>'technician_price'), 0) * coalesce(public._num(i->>'quantity'), 1))
      from jsonb_array_elements(public._items_array(e.items)) i where jsonb_typeof(i) = 'object'), 0) else 0 end,
    case when me.earnings then coalesce(e.technician_paid_amount, 0) else 0 end
  from public.external_lab_order e, me
  where me.id is not null and e.technician_id = me.id
  order by e.order_date desc nulls last, e.id desc;
$$;

create or replace function public.get_external_providers_min()
returns table (id int, name text)
language sql stable security definer
set search_path = public
as $$
  select p.id, p.name from public.external_provider p
  where public.tech_perm('add_external')
  order by p.name;
$$;

-- p_items: [{ "service_id": "<uuid technician_service>", "quantity": 1 }]
create or replace function public.create_my_external_order(p_provider_id int, p_order_date date, p_notes text, p_items jsonb)
returns int language plpgsql security definer
set search_path = public
as $$
declare
  v_tech uuid := public.current_technician_id();
  v_lab text;
  v_items jsonb;
  v_id int;
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('add_external') then raise exception 'no_permission'; end if;
  select name into v_lab from public.external_provider where id = p_provider_id;
  if v_lab is null then raise exception 'provider_not_found'; end if;

  select jsonb_agg(jsonb_build_object(
           'technician_service_id', s.id,
           'service_name', '[Технік] ' || s.service_name,
           'quantity', q.qty,
           'unit_price', 0,
           'total', 0,
           'technician_pay', coalesce(s.technician_pay, 0)))
    into v_items
  from (
    select (x->>'service_id')::uuid as sid, greatest(1, least(100, coalesce(public._num(x->>'quantity'), 1)))::int as qty
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
    where (x->>'service_id') ~* '^[0-9a-f-]{36}$'
    limit 30
  ) q
  join public.technician_service s on s.id = q.sid and s.technician_id = v_tech;

  if v_items is null then raise exception 'no_items'; end if;

  insert into public.external_lab_order (provider_id, lab_name, order_date, notes, items, total_amount, payment_status, status, technician_id, technician_paid_amount, created_at)
  values (p_provider_id, v_lab, coalesce(p_order_date, current_date), left(coalesce(p_notes, ''), 2000), v_items, 0, 'Борг', 'В роботі', v_tech, 0, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── Коригування зарплати самим техніком ───────────────────────────────────
create or replace function public.create_my_adjustment(p_description text, p_amount numeric)
returns uuid language plpgsql security definer
set search_path = public
as $$
declare v_tech uuid := public.current_technician_id(); v_id uuid;
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('adjust_salary') then raise exception 'no_permission'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'bad_amount'; end if;
  if length(trim(coalesce(p_description, ''))) < 2 then raise exception 'no_description'; end if;
  insert into public.technician_adjustment (technician_id, description, amount, is_paid)
  values (v_tech, '[від техніка] ' || left(trim(p_description), 300), round(p_amount, 2), false)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_my_adjustment(p_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare v_tech uuid := public.current_technician_id();
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('adjust_salary') then raise exception 'no_permission'; end if;
  delete from public.technician_adjustment
   where id = p_id and technician_id = v_tech and not coalesce(is_paid, false) and salary_payment_id is null
     and description like '[від техніка]%';
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- ─── Створення наряду техніком ──────────────────────────────────────────────
-- Довідники без цін
create or replace function public.get_order_form_lists()
returns jsonb language sql stable security definer
set search_path = public
as $$
  select case when public.tech_perm('create_orders') then jsonb_build_object(
    'clinics', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name) from public.clinic c), '[]'::jsonb),
    'doctors', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'full_name', d.full_name, 'clinic_id', d.clinic_id) order by d.full_name) from public.doctor d), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category) order by p.category, p.name) from public.price_item p), '[]'::jsonb)
  ) else null end;
$$;

-- Наряд створюється зі статусом «Новий» на цього техніка. Ціни з прайсу
-- підставляються в позиції, але суму наряду власник перевіряє/зберігає сам.
create or replace function public.create_my_order(p jsonb)
returns text language plpgsql security definer
set search_path = public
as $$
declare
  v_tech uuid := public.current_technician_id();
  v_tech_name text;
  v_clinic_id uuid;
  v_clinic_name text;
  v_doctor_id uuid;
  v_doctor_name text;
  v_doctor_disc numeric;
  v_items jsonb;
  v_teeth text[];
  v_id bigint;
  v_number text := 'Н-' || to_char(now(), 'YYYY') || '-' || (1000 + floor(random() * 9000))::int;
begin
  if v_tech is null then raise exception 'not_technician'; end if;
  if not public.tech_perm('create_orders') then raise exception 'no_permission'; end if;
  if length(trim(coalesce(p->>'patient_name', ''))) < 2 then raise exception 'missing_patient'; end if;

  select full_name into v_tech_name from public.technician where id = v_tech;
  if (p->>'clinic_id') ~* '^[0-9a-f-]{36}$' then
    select id, name into v_clinic_id, v_clinic_name from public.clinic where id = (p->>'clinic_id')::uuid;
  end if;
  if (p->>'doctor_id') ~* '^[0-9a-f-]{36}$' then
    select id, full_name, discount_percent into v_doctor_id, v_doctor_name, v_doctor_disc from public.doctor where id = (p->>'doctor_id')::uuid;
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', substr(md5(random()::text), 1, 10),
           'date', now(),
           'price_item_id', pi.id::text,
           'technician_service_id', 'none',
           'service_name', pi.name || coalesce(' (Зуб ' || nullif(q.teeth, '') || ')', ''),
           'category', coalesce(pi.category, ''),
           'teeth_numbers', nullif(q.teeth, ''),
           'quantity', q.qty,
           'unit_price', coalesce(pi.client_price, 0),
           'total', coalesce(pi.client_price, 0) * q.qty,
           'technician_pay', coalesce(pi.technician_pay, 0),
           'price_currency', coalesce(pi.price_currency, 'UAH')))
    into v_items
  from (
    select (x->>'price_item_id')::uuid as pid,
           greatest(1, least(100, coalesce(public._num(x->>'quantity'), 1)))::int as qty,
           left(regexp_replace(coalesce(x->>'teeth', ''), '[^0-9, ]', '', 'g'), 60) as teeth
    from jsonb_array_elements(case when jsonb_typeof(p->'items') = 'array' then p->'items' else '[]'::jsonb end) x
    where (x->>'price_item_id') ~* '^[0-9a-f-]{36}$'
    limit 40
  ) q
  join public.price_item pi on pi.id = q.pid;

  select array_agg(distinct t) into v_teeth
  from (
    select trim(t) t from jsonb_array_elements_text(case when jsonb_typeof(p->'selected_teeth') = 'array' then p->'selected_teeth' else '[]'::jsonb end) t
    where trim(t) ~ '^[1-4][1-8]$'
  ) s;

  insert into public."WorkOrder" (
    order_number, creation_date, status, payment_status,
    patient_name, patient_age, patient_gender,
    clinic_id, clinic_name, doctor_id, doctor_name, doctor_discount,
    technician_id, technician_name,
    due_date, tooth_color, selected_teeth, notes, items,
    total_amount, file_urls
  ) values (
    v_number, now(), 'Новий', 'Борг',
    left(trim(p->>'patient_name'), 200),
    case when (p->>'patient_age') ~ '^\d{1,3}$' then (p->>'patient_age')::int end,
    case when p->>'patient_gender' in ('Чоловік', 'Жінка') then p->>'patient_gender' end,
    v_clinic_id, coalesce(v_clinic_name, 'Приватна практика'),
    v_doctor_id, coalesce(v_doctor_name, 'Не вказано'), coalesce(v_doctor_disc, 0)::text,
    v_tech::text, v_tech_name,
    case when (p->>'due_date') ~ '^\d{4}-\d{2}-\d{2}$' then (p->>'due_date')::date end,
    left(coalesce(p->>'tooth_color', ''), 50),
    coalesce(v_teeth, '{}'),
    concat_ws(E'\n', '⚠️ Створено техніком ' || coalesce(v_tech_name, '') || ' — перевірте ціни та збережіть наряд', nullif(left(coalesce(p->>'notes', ''), 4000), '')),
    coalesce(v_items, '[]'::jsonb),
    0, '[]'
  )
  returning id into v_id;
  return v_id::text;
end;
$$;

revoke all on function public.get_my_orders()                                   from public;
revoke all on function public.get_my_external_orders()                          from public;
revoke all on function public.get_external_providers_min()                      from public;
revoke all on function public.create_my_external_order(int, date, text, jsonb)  from public;
revoke all on function public.create_my_adjustment(text, numeric)               from public;
revoke all on function public.delete_my_adjustment(uuid)                        from public;
revoke all on function public.get_order_form_lists()                            from public;
revoke all on function public.create_my_order(jsonb)                            from public;
grant execute on function public.get_my_orders()                                  to authenticated;
grant execute on function public.get_my_external_orders()                         to authenticated;
grant execute on function public.get_external_providers_min()                     to authenticated;
grant execute on function public.create_my_external_order(int, date, text, jsonb) to authenticated;
grant execute on function public.create_my_adjustment(text, numeric)              to authenticated;
grant execute on function public.delete_my_adjustment(uuid)                       to authenticated;
grant execute on function public.get_order_form_lists()                           to authenticated;
grant execute on function public.create_my_order(jsonb)                           to authenticated;

notify pgrst, 'reload schema';
