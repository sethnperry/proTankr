-- Per diem. A driver is away from their home base on some days; the app suggests those days (from the truck's
-- GPS if there is a telematics link, else from the cities on their trips) and the driver claims them. Nobody
-- claims a day for a driver: only the driver writes their own days. Admins read.
--   per_diem_homes: where home is (city, state, and its coordinates) and how far counts as away.
--   per_diem_days: one row per driver per day away, with the city and state and where the suggestion came from
--     (geotab, app, manual). status 'withdrawn' takes a claimed day back without deleting the record.

create table if not exists public.per_diem_homes (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  company_id   uuid not null references public.companies(company_id) on delete cascade,
  city         text not null,
  state        text not null,
  lat          double precision,
  lon          double precision,
  radius_miles integer not null default 50 check (radius_miles between 5 and 500),
  updated_at   timestamptz not null default now()
);
alter table public.per_diem_homes enable row level security;
drop policy if exists per_diem_homes_select on public.per_diem_homes;
create policy per_diem_homes_select on public.per_diem_homes for select using (user_id = auth.uid() or public.is_company_admin(company_id));
drop policy if exists per_diem_homes_write on public.per_diem_homes;
create policy per_diem_homes_write on public.per_diem_homes for all
  using (user_id = auth.uid() or public.is_company_admin(company_id))
  with check ((user_id = auth.uid() and public.is_company_member(company_id)) or public.is_company_admin(company_id));

create table if not exists public.per_diem_days (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  city       text not null,
  state      text not null,
  source     text not null default 'manual' check (source in ('geotab', 'app', 'manual')),
  status     text not null default 'claimed' check (status in ('claimed', 'withdrawn')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  primary key (user_id, day)
);
create index if not exists per_diem_days_company_idx on public.per_diem_days (company_id, day desc);
alter table public.per_diem_days enable row level security;
drop policy if exists per_diem_days_select on public.per_diem_days;
create policy per_diem_days_select on public.per_diem_days for select using (user_id = auth.uid() or public.is_company_admin(company_id));
drop policy if exists per_diem_days_insert on public.per_diem_days;
create policy per_diem_days_insert on public.per_diem_days for insert with check (user_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists per_diem_days_update on public.per_diem_days;
create policy per_diem_days_update on public.per_diem_days for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_company_member(company_id));
