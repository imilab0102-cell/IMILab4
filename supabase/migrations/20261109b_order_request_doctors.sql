-- ============================================================================
-- Заявки від лікарів: вибір лікаря з довідника клініки, ПІБ лікаря необов'язкове
-- Лише додає колонку/функцію та оновлює submit_order_request. Дані не змінюються.
-- ============================================================================

alter table public.order_request alter column doctor_name drop not null;
alter table public.order_request add column if not exists doctor_id text;

-- Лікарі клініки, до якої належить код (для вибору у формі)
create or replace function public.get_order_request_doctors(p_token text)
returns table (id uuid, full_name text, phone text)
language sql security definer stable
set search_path = public
as $$
  select d.id, d.full_name, d.phone
  from public.doctor d
  join public.order_request_link l on l.clinic_id = d.clinic_id::text
  where l.token = p_token and l.active
  order by d.full_name;
$$;

revoke all on function public.get_order_request_doctors(text) from public;
grant execute on function public.get_order_request_doctors(text) to anon, authenticated;

create or replace function public.submit_order_request(
  p_token   text,
  p_payload jsonb,
  p_hp      text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_link   public.order_request_link;
  v_ip     text;
  v_files  text[];
  v_id     uuid;
  v_doc_id text;
  v_doc    record;
  v_name   text;
  v_phone  text;
begin
  if coalesce(p_hp, '') <> '' then
    raise exception 'rejected';
  end if;

  select * into v_link
  from public.order_request_link
  where token = p_token and active;
  if not found then
    raise exception 'invalid_link';
  end if;

  if p_payload is null or pg_column_size(p_payload) > 40000 then
    raise exception 'too_large';
  end if;

  if length(trim(coalesce(p_payload->>'patient_name', ''))) < 2 then
    raise exception 'missing_fields';
  end if;

  begin
    v_ip := nullif(trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    v_ip := null;
  end;

  if (select count(*) from public.order_request
      where link_id = v_link.id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;

  if v_ip is not null and (select count(*) from public.order_request
      where sender_ip = v_ip and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  -- лікар із довідника: приймаємо лише лікаря цієї клініки
  v_name  := nullif(left(trim(coalesce(p_payload->>'doctor_name', '')), 200), '');
  v_phone := nullif(left(trim(coalesce(p_payload->>'doctor_phone', '')), 50), '');
  if (p_payload->>'doctor_id') ~* '^[0-9a-f-]{36}$' then
    select d.id, d.full_name, d.phone into v_doc
    from public.doctor d
    where d.id = (p_payload->>'doctor_id')::uuid
      and d.clinic_id::text = v_link.clinic_id;
    if found then
      v_doc_id := v_doc.id::text;
      v_name   := coalesce(v_name, v_doc.full_name);
      v_phone  := coalesce(v_phone, v_doc.phone);
    end if;
  end if;

  select coalesce(array_agg(f), '{}') into v_files
  from (
    select jsonb_array_elements_text(
             case when jsonb_typeof(p_payload->'file_paths') = 'array'
                  then p_payload->'file_paths' else '[]'::jsonb end) as f
    limit 20
  ) s
  where f like p_token || '/%' and f not like '%..%';

  insert into public.order_request (
    user_id, link_id, clinic_id, clinic_name,
    doctor_id, doctor_name, doctor_phone, patient_name, patient_age, patient_gender,
    impression_date, try_in_date, due_date, due_time, urgent,
    details, notes, file_paths, sender_ip
  ) values (
    v_link.user_id, v_link.id, v_link.clinic_id, v_link.clinic_name,
    v_doc_id, v_name, v_phone,
    left(trim(p_payload->>'patient_name'), 200),
    case when (p_payload->>'patient_age') ~ '^\d{1,3}$' then (p_payload->>'patient_age')::int end,
    case when p_payload->>'patient_gender' in ('Чоловік', 'Жінка') then p_payload->>'patient_gender' end,
    case when (p_payload->>'impression_date') ~ '^\d{4}-\d{2}-\d{2}$' then (p_payload->>'impression_date')::date end,
    case when (p_payload->>'try_in_date')     ~ '^\d{4}-\d{2}-\d{2}$' then (p_payload->>'try_in_date')::date end,
    case when (p_payload->>'due_date')        ~ '^\d{4}-\d{2}-\d{2}$' then (p_payload->>'due_date')::date end,
    case when (p_payload->>'due_time')        ~ '^\d{2}:\d{2}$'       then p_payload->>'due_time' end,
    coalesce((p_payload->>'urgent')::boolean, false),
    case when jsonb_typeof(p_payload->'details') = 'object' then p_payload->'details' else '{}'::jsonb end,
    left(p_payload->>'notes', 4000),
    v_files,
    v_ip
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_order_request(text, jsonb, text) from public;
grant execute on function public.submit_order_request(text, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
