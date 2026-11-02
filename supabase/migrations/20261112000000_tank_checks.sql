-- Meter tickets: store tank readings outside a delivery (Tank check), the photo of the meter ticket after a drop,
-- and the company's tolerance against a future live tank feed.
-- A check is one visit to one store: a header (who, where, when, photos) and one reading per tank.
-- A drop's ticket photo is a header with delivery_id set and no readings (those live in trip_delivery_tanks).

alter table public.trip_settings add column if not exists tank_feed_tolerance_gal integer not null default 50;

create table if not exists public.tank_checks (
  check_id      uuid primary key,
  company_id    uuid not null references public.companies(company_id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  location_id   uuid,
  location_name text,
  truck_id      uuid,
  delivery_id   uuid,
  read_at       timestamptz not null default now(),
  photo_paths   text[] not null default '{}',
  note          text,
  source        text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  client_updated_at timestamptz
);
create index if not exists tank_checks_company_idx on public.tank_checks (company_id, read_at desc);
create index if not exists tank_checks_location_idx on public.tank_checks (location_id, read_at desc);

create table if not exists public.tank_check_readings (
  check_id     uuid not null references public.tank_checks(check_id) on delete cascade,
  tank_number  text not null,
  product_id   uuid,
  reading      numeric,
  reading_unit text not null default 'gallons' check (reading_unit in ('gallons', 'inches')),
  water_inches numeric,
  client_updated_at timestamptz,
  primary key (check_id, tank_number)
);

alter table public.tank_checks enable row level security;
alter table public.tank_check_readings enable row level security;

drop policy if exists tank_checks_select on public.tank_checks;
create policy tank_checks_select on public.tank_checks for select using (public.is_company_member(company_id));
drop policy if exists tank_checks_insert on public.tank_checks;
create policy tank_checks_insert on public.tank_checks for insert with check (user_id = auth.uid() and public.is_company_member(company_id));

drop policy if exists tank_check_readings_select on public.tank_check_readings;
create policy tank_check_readings_select on public.tank_check_readings for select
  using (exists (select 1 from public.tank_checks c where c.check_id = tank_check_readings.check_id and public.is_company_member(c.company_id)));
drop policy if exists tank_check_readings_insert on public.tank_check_readings;
create policy tank_check_readings_insert on public.tank_check_readings for insert
  with check (exists (select 1 from public.tank_checks c where c.check_id = tank_check_readings.check_id and c.user_id = auth.uid()));
-- No update or delete: a reading is a record.
