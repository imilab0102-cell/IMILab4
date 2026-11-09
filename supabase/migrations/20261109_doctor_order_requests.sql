-- ============================================================================
-- Заявки від лікарів (онлайн-наряд за QR-кодом)
--
-- Як застосувати: Supabase Dashboard → SQL Editor → New query →
-- вставити ВЕСЬ цей файл → Run. Скрипт можна запускати повторно.
--
-- Нічого з існуючих таблиць (WorkOrder, clinic, doctor ...) НЕ змінюється.
-- Створюються лише нові таблиці, функції та сховище для фото.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── 1. Посилання для клінік (секретний код у QR) ────────────────────────────
create table if not exists public.order_request_link (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clinic_id   text,
  clinic_name text not null,
  token       text not null unique default encode(gen_random_bytes(12), 'hex'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.order_request_link enable row level security;

drop policy if exists "order_request_link_owner" on public.order_request_link;
create policy "order_request_link_owner" on public.order_request_link
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 2. Заявки від лікарів ───────────────────────────────────────────────────
create table if not exists public.order_request (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  link_id         uuid references public.order_request_link(id) on delete set null,
  clinic_id       text,
  clinic_name     text,
  status          text not null default 'Новий'
                  check (status in ('Новий', 'Прийнято', 'Відхилено')),
  work_order_id   text,
  doctor_name     text not null,
  doctor_phone    text,
  patient_name    text not null,
  patient_age     int,
  patient_gender  text,
  impression_date date,
  try_in_date     date,
  due_date        date,
  due_time        text,
  urgent          boolean not null default false,
  details         jsonb not null default '{}'::jsonb,  -- зуби, роботи, матеріали, колір, імплант…
  notes           text,
  file_paths      text[] not null default '{}',
  sender_ip       text,
  created_at      timestamptz not null default now()
);

create index if not exists order_request_user_created_idx on public.order_request (user_id, created_at desc);
create index if not exists order_request_link_created_idx on public.order_request (link_id, created_at desc);
create index if not exists order_request_ip_created_idx   on public.order_request (sender_ip, created_at desc);

alter table public.order_request enable row level security;

-- Власник лабораторії бачить і керує лише своїми заявками.
-- Політики INSERT немає навмисно: анонімно додати заявку можна ЛИШЕ через
-- функцію submit_order_request (з перевіркою коду, пасткою та лімітами).
drop policy if exists "order_request_owner_select" on public.order_request;
create policy "order_request_owner_select" on public.order_request
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "order_request_owner_update" on public.order_request;
create policy "order_request_owner_update" on public.order_request
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "order_request_owner_delete" on public.order_request;
create policy "order_request_owner_delete" on public.order_request
  for delete to authenticated using (user_id = auth.uid());

-- ─── 3. Публічні функції для форми ───────────────────────────────────────────

-- Чи активний код (використовується формою і політиками сховища)
create or replace function public.is_active_order_request_token(p_token text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.order_request_link
    where token = p_token and active
  );
$$;

-- Дані для відкриття форми: лише назва клініки, нічого більше
create or replace function public.get_order_request_form(p_token text)
returns table (clinic_name text)
language sql security definer stable
set search_path = public
as $$
  select l.clinic_name
  from public.order_request_link l
  where l.token = p_token and l.active
  limit 1;
$$;

-- Надсилання заявки
create or replace function public.submit_order_request(
  p_token   text,
  p_payload jsonb,
  p_hp      text default null   -- поле-пастка: людина його не бачить, бот заповнює
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_link  public.order_request_link;
  v_ip    text;
  v_files text[];
  v_id    uuid;
begin
  -- 1) пастка для ботів
  if coalesce(p_hp, '') <> '' then
    raise exception 'rejected';
  end if;

  -- 2) секретний код клініки
  select * into v_link
  from public.order_request_link
  where token = p_token and active;
  if not found then
    raise exception 'invalid_link';
  end if;

  -- 3) розмір
  if p_payload is null or pg_column_size(p_payload) > 40000 then
    raise exception 'too_large';
  end if;

  -- 4) обов'язкові поля
  if length(trim(coalesce(p_payload->>'doctor_name', ''))) < 2
     or length(trim(coalesce(p_payload->>'patient_name', ''))) < 2 then
    raise exception 'missing_fields';
  end if;

  -- 5) ліміти частоти
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

  -- 6) файли: тільки з папки цього коду, не більше 20
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
    doctor_name, doctor_phone, patient_name, patient_age, patient_gender,
    impression_date, try_in_date, due_date, due_time, urgent,
    details, notes, file_paths, sender_ip
  ) values (
    v_link.user_id, v_link.id, v_link.clinic_id, v_link.clinic_name,
    left(trim(p_payload->>'doctor_name'), 200),
    left(nullif(trim(p_payload->>'doctor_phone'), ''), 50),
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

revoke all on function public.is_active_order_request_token(text)            from public;
revoke all on function public.get_order_request_form(text)                   from public;
revoke all on function public.submit_order_request(text, jsonb, text)        from public;
grant execute on function public.is_active_order_request_token(text)         to anon, authenticated;
grant execute on function public.get_order_request_form(text)                to anon, authenticated;
grant execute on function public.submit_order_request(text, jsonb, text)     to anon, authenticated;

-- ─── 4. Сховище для фото / сканів ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-requests', 'order-requests', false, 15728640,   -- 15 МБ на файл
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'application/zip', 'application/octet-stream',
    'model/stl', 'application/sla', 'application/vnd.ms-pki.stl'
  ]
)
on conflict (id) do nothing;

-- Завантажувати можна лише в папку активного коду: order-requests/<код>/файл
drop policy if exists "order_requests_upload" on storage.objects;
create policy "order_requests_upload" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'order-requests'
    and public.is_active_order_request_token((storage.foldername(name))[1])
  );

-- Переглядати й видаляти файли може лише власник лабораторії
drop policy if exists "order_requests_owner_read" on storage.objects;
create policy "order_requests_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-requests'
    and exists (
      select 1 from public.order_request_link l
      where l.token = (storage.foldername(name))[1] and l.user_id = auth.uid()
    )
  );

drop policy if exists "order_requests_owner_delete" on storage.objects;
create policy "order_requests_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-requests'
    and exists (
      select 1 from public.order_request_link l
      where l.token = (storage.foldername(name))[1] and l.user_id = auth.uid()
    )
  );
