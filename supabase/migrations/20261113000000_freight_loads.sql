-- Freight loads (van, flatbed, lowboy) and the LTS route preset. Independent of trips and dispatch.
-- One open freight load per truck. After Delivered the truck is empty until the next load begins or the driver ends it.
-- No pay math anywhere: only odometer, dates and counts are kept.

create table if not exists public.freight_loads (
  freight_id       uuid primary key,
  company_id       uuid not null references public.companies(company_id) on delete cascade,
  driver_id        uuid not null references auth.users(id) on delete cascade,
  truck_id         uuid,
  trailer_id       uuid,
  trailer_kind     text check (trailer_kind in ('van', 'flatbed', 'lowboy', 'other')),
  trailer_label    text,
  preset           text not null default 'standard' check (preset in ('standard', 'lts')),
  reference        text,
  customer         text,
  origin_text      text,
  destination_text text,
  route_number     text,
  status           text not null default 'open' check (status in ('open', 'delivered', 'cancelled')),
  begin_odometer   numeric,
  begun_at         timestamptz not null default now(),
  end_odometer     numeric,
  delivered_at     timestamptz,
  empty_end_odometer numeric,
  empty_ended_at   timestamptz,
  manifest_paths   text[] not null default '{}',
  manifest_signature text,
  notes            text,
  source           text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  client_updated_at timestamptz
);
create unique index if not exists freight_one_open_per_truck on public.freight_loads (truck_id) where status = 'open' and truck_id is not null;
create index if not exists freight_loads_company_idx on public.freight_loads (company_id, begun_at desc);
create index if not exists freight_loads_driver_idx on public.freight_loads (driver_id, begun_at desc);

create table if not exists public.freight_stops (
  stop_id    uuid primary key,
  freight_id uuid not null references public.freight_loads(freight_id) on delete cascade,
  seq        integer not null default 0,
  name       text not null,
  casings    integer not null default 0 check (casings >= 0),
  totes      integer not null default 0 check (totes >= 0),
  note       text,
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);
create index if not exists freight_stops_freight_idx on public.freight_stops (freight_id, seq);

drop trigger if exists freight_loads_sync on public.freight_loads;
create trigger freight_loads_sync before insert or update on public.freight_loads for each row execute function public.trip_sync_write();
drop trigger if exists freight_stops_sync on public.freight_stops;
create trigger freight_stops_sync before insert or update on public.freight_stops for each row execute function public.trip_sync_write();

alter table public.freight_loads enable row level security;
alter table public.freight_stops enable row level security;

drop policy if exists freight_loads_select on public.freight_loads;
create policy freight_loads_select on public.freight_loads for select using (driver_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists freight_loads_insert on public.freight_loads;
create policy freight_loads_insert on public.freight_loads for insert with check (driver_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists freight_loads_update on public.freight_loads;
create policy freight_loads_update on public.freight_loads for update using (driver_id = auth.uid()) with check (driver_id = auth.uid() and public.is_company_member(company_id));

drop policy if exists freight_stops_select on public.freight_stops;
create policy freight_stops_select on public.freight_stops for select
  using (exists (select 1 from public.freight_loads f where f.freight_id = freight_stops.freight_id and (f.driver_id = auth.uid() or public.is_company_staff(f.company_id))));
drop policy if exists freight_stops_write on public.freight_stops;
create policy freight_stops_write on public.freight_stops for all
  using (exists (select 1 from public.freight_loads f where f.freight_id = freight_stops.freight_id and f.driver_id = auth.uid()))
  with check (exists (select 1 from public.freight_loads f where f.freight_id = freight_stops.freight_id and f.driver_id = auth.uid()));

-- A manager can set up a freight recap email to an address of their choosing, without being a company admin:
-- only their own 'freight_recap' recap rows.
drop policy if exists notification_schedules_freight_self on public.notification_schedules;
create policy notification_schedules_freight_self on public.notification_schedules for all
  using (template_key = 'freight_recap' and created_by = auth.uid() and public.is_company_staff(company_id))
  with check (template_key = 'freight_recap' and created_by = auth.uid() and public.is_company_staff(company_id));
