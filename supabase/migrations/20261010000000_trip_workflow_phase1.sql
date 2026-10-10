-- Trip workflow, phase 1: data model.
-- Design: docs/trip-workflow-design.md
--
-- Purely additive. Nothing in the app reads or writes these tables yet; phase 2
-- (dashboard + Start Load) is the first consumer. Safe to apply before any app
-- code ships.
--
-- Re-runnable: every policy and trigger is dropped-if-exists first.
--
-- Offline-first: the phone generates every primary key (uuid) and queues
-- upserts, so every trip table takes a client-supplied id and a
-- client_updated_at. A trigger keeps the newest client write per row
-- (last-write-wins by the device's own edit time, not by arrival order), so a
-- phone that comes back online late can't overwrite a newer edit made on
-- another phone during a driver handoff.
--
-- Verified on a throwaway PostgreSQL 16 before writing this for real, with
-- stubs for auth.uid(), companies, trucks, trailers, terminals, products,
-- load_log, user_companies, wash_records, is_super_admin(), is_company_admin().

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Company membership, any role. SECURITY DEFINER so policies can check
-- user_companies without tripping its own RLS (same reason is_company_staff()
-- is SECURITY DEFINER). Distinct name so it can't collide with anything that
-- may already exist live.
create or replace function public.trip_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_super_admin()
      or exists (
        select 1 from public.user_companies uc
        where uc.user_id = auth.uid()
          and uc.company_id = p_company_id
      );
$$;

-- Keep updated_at current.
create or replace function public.trip_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Last-write-wins by client edit time. An update carrying an older
-- client_updated_at than the stored row is ignored (the row keeps its
-- newer values) instead of failing, so a stale queued write from a phone that
-- was offline drains cleanly without blocking the rest of its queue.
create or replace function public.trip_keep_newest_client_write()
returns trigger
language plpgsql
as $$
begin
  if old.client_updated_at is not null
     and new.client_updated_at is not null
     and new.client_updated_at < old.client_updated_at then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Company settings
-- ---------------------------------------------------------------------------

create table if not exists public.trip_settings (
  company_id uuid primary key references public.companies(company_id) on delete cascade,
  -- "Begin" is prefilled as this many minutes before the driver finishes the step.
  begin_offset_minutes integer not null default 10
    check (begin_offset_minutes between 0 and 240),
  loading_delay_threshold_minutes integer not null default 30
    check (loading_delay_threshold_minutes between 0 and 1440),
  delivery_delay_threshold_minutes integer not null default 30
    check (delivery_delay_threshold_minutes between 0 and 1440),
  require_consignee_signature boolean not null default false,
  require_tank_readings boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.trip_settings enable row level security;

drop policy if exists trip_settings_read on public.trip_settings;
create policy trip_settings_read on public.trip_settings
  for select using (public.trip_company_member(company_id));
drop policy if exists trip_settings_admin_insert on public.trip_settings;
create policy trip_settings_admin_insert on public.trip_settings
  for insert with check (public.is_company_admin(company_id));
drop policy if exists trip_settings_admin_update on public.trip_settings;
create policy trip_settings_admin_update on public.trip_settings
  for update using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

drop trigger if exists trip_settings_touch on public.trip_settings;
create trigger trip_settings_touch before update on public.trip_settings
  for each row execute function public.trip_touch_updated_at();

-- Company-managed delay reasons, one list per kind. Soft delete only.
create table if not exists public.delay_reasons (
  reason_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  kind text not null check (kind in ('loading','delivery')),
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists delay_reasons_company_idx on public.delay_reasons (company_id, kind);

alter table public.delay_reasons enable row level security;

drop policy if exists delay_reasons_read on public.delay_reasons;
create policy delay_reasons_read on public.delay_reasons
  for select using (public.trip_company_member(company_id));
drop policy if exists delay_reasons_staff_insert on public.delay_reasons;
create policy delay_reasons_staff_insert on public.delay_reasons
  for insert with check (public.is_company_staff(company_id));
drop policy if exists delay_reasons_staff_update on public.delay_reasons;
create policy delay_reasons_staff_update on public.delay_reasons
  for update using (public.is_company_staff(company_id))
  with check (public.is_company_staff(company_id));

-- ---------------------------------------------------------------------------
-- Delivery locations (shared across the company)
-- ---------------------------------------------------------------------------

create table if not exists public.delivery_locations (
  location_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  location_number text,           -- store number etc.
  address text,
  city text,
  state text,
  lat double precision,
  lon double precision,
  delivery_type text not null default 'drop' check (delivery_type in ('drop','pump_off')),
  notes text,                     -- hose length, gate code, etc.
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists delivery_locations_company_idx on public.delivery_locations (company_id) where is_active;

alter table public.delivery_locations enable row level security;

-- Drivers save locations as they go, so any member can add and edit.
-- No delete policy: retire with is_active = false.
drop policy if exists delivery_locations_read on public.delivery_locations;
create policy delivery_locations_read on public.delivery_locations
  for select using (public.trip_company_member(company_id));
drop policy if exists delivery_locations_insert on public.delivery_locations;
create policy delivery_locations_insert on public.delivery_locations
  for insert with check (public.trip_company_member(company_id));
drop policy if exists delivery_locations_update on public.delivery_locations;
create policy delivery_locations_update on public.delivery_locations
  for update using (public.trip_company_member(company_id))
  with check (public.trip_company_member(company_id));

drop trigger if exists delivery_locations_touch on public.delivery_locations;
create trigger delivery_locations_touch before update on public.delivery_locations
  for each row execute function public.trip_touch_updated_at();
drop trigger if exists delivery_locations_newest on public.delivery_locations;
create trigger delivery_locations_newest before update on public.delivery_locations
  for each row execute function public.trip_keep_newest_client_write();

-- The location's own tanks, remembered so compartment -> tank is prefilled.
create table if not exists public.delivery_location_tanks (
  tank_id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.delivery_locations(location_id) on delete cascade,
  tank_number text not null check (length(trim(tank_number)) > 0),
  product_id uuid references public.products(product_id),
  capacity_gallons numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  unique (location_id, tank_number)
);

alter table public.delivery_location_tanks enable row level security;

drop policy if exists delivery_location_tanks_all on public.delivery_location_tanks;
create policy delivery_location_tanks_all on public.delivery_location_tanks
  for all using (exists (
    select 1 from public.delivery_locations l
    where l.location_id = delivery_location_tanks.location_id
      and public.trip_company_member(l.company_id)))
  with check (exists (
    select 1 from public.delivery_locations l
    where l.location_id = delivery_location_tanks.location_id
      and public.trip_company_member(l.company_id)));

drop trigger if exists delivery_location_tanks_touch on public.delivery_location_tanks;
create trigger delivery_location_tanks_touch before update on public.delivery_location_tanks
  for each row execute function public.trip_touch_updated_at();
drop trigger if exists delivery_location_tanks_newest on public.delivery_location_tanks;
create trigger delivery_location_tanks_newest before update on public.delivery_location_tanks
  for each row execute function public.trip_keep_newest_client_write();

-- Personal stars (always shown in the picker regardless of distance).
create table if not exists public.delivery_location_stars (
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.delivery_locations(location_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

alter table public.delivery_location_stars enable row level security;

drop policy if exists delivery_location_stars_own on public.delivery_location_stars;
create policy delivery_location_stars_own on public.delivery_location_stars
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  trip_id uuid primary key,       -- generated on the phone
  company_id uuid not null references public.companies(company_id) on delete cascade,
  truck_id uuid references public.trucks(truck_id) on delete set null,
  trailer_id uuid references public.trailers(trailer_id) on delete set null,
  driver_id uuid not null references auth.users(id),   -- current holder (moves on handoff)
  created_by uuid not null references auth.users(id),
  status text not null default 'draft'
    check (status in ('draft','loading','in_transit','delivering','complete','cancelled')),
  shipper text,
  customer text,
  begin_miles numeric(10,1),
  end_miles numeric(10,1),
  entered_late boolean not null default false,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists trips_company_idx on public.trips (company_id, created_at desc);
create index if not exists trips_driver_idx on public.trips (driver_id, created_at desc);
create index if not exists trips_trailer_open_idx on public.trips (trailer_id)
  where status not in ('complete','cancelled');
-- Beginning miles = the truck's last ending miles.
create index if not exists trips_truck_end_miles_idx on public.trips (truck_id, completed_at desc)
  where end_miles is not null;

alter table public.trips enable row level security;

-- Company-wide so a handoff driver can take over the trip. A trip can only be
-- created by its own creator, in a company they belong to.
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips
  for select using (public.trip_company_member(company_id));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert with check (public.trip_company_member(company_id) and created_by = auth.uid());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips
  for update using (public.trip_company_member(company_id))
  with check (public.trip_company_member(company_id));

drop trigger if exists trips_touch on public.trips;
create trigger trips_touch before update on public.trips
  for each row execute function public.trip_touch_updated_at();
drop trigger if exists trips_newest on public.trips;
create trigger trips_newest before update on public.trips
  for each row execute function public.trip_keep_newest_client_write();

-- Membership of the company that owns a trip (defined after trips exists;
-- SQL function bodies are checked at creation).
create or replace function public.trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.trips t
    where t.trip_id = p_trip_id
      and public.trip_company_member(t.company_id)
  );
$$;

-- Order numbers. Normally one per trip (is_primary); extra ones only when added.
create table if not exists public.trip_orders (
  order_id uuid primary key,
  trip_id uuid not null references public.trips(trip_id) on delete cascade,
  order_number text,
  -- Null = same as the trip's shipper/customer (the normal case).
  shipper text,
  customer text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create unique index if not exists trip_orders_one_primary on public.trip_orders (trip_id) where is_primary;

create table if not exists public.trip_pickups (
  pickup_id uuid primary key,
  trip_id uuid not null references public.trips(trip_id) on delete cascade,
  seq integer not null default 1,
  pickup_type text not null default 'terminal'
    check (pickup_type in ('terminal','railcar','transload','other')),
  terminal_id uuid references public.terminals(terminal_id),
  rack_id uuid,
  name text,                      -- free text when not a catalog terminal
  city text,
  state text,
  odometer numeric(10,1),         -- only asked on a cross-city rack hop
  arrived_at timestamptz,
  begin_at timestamptz,
  left_at timestamptz,
  delay_reason_id uuid references public.delay_reasons(reason_id),
  delay_note text,
  load_id uuid references public.load_log(load_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists trip_pickups_trip_idx on public.trip_pickups (trip_id, seq);

create table if not exists public.trip_deliveries (
  delivery_id uuid primary key,
  trip_id uuid not null references public.trips(trip_id) on delete cascade,
  seq integer not null default 1,
  location_id uuid references public.delivery_locations(location_id),
  one_off_name text,              -- free-text delivery, not saved to the list
  one_off_address text,
  delivery_type text not null default 'drop' check (delivery_type in ('drop','pump_off')),
  status text not null default 'planned' check (status in ('planned','complete','cancelled')),
  arrived_at timestamptz,
  begin_at timestamptz,
  left_at timestamptz,
  delay_reason_id uuid references public.delay_reasons(reason_id),
  delay_note text,
  delivering_driver_id uuid references auth.users(id),
  driver_signed_at timestamptz,   -- tap-to-accept of the saved signature
  consignee_name text,
  consignee_signature text,       -- svg path data
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists trip_deliveries_trip_idx on public.trip_deliveries (trip_id, seq);

create table if not exists public.trip_delivery_tanks (
  delivery_tank_id uuid primary key,
  delivery_id uuid not null references public.trip_deliveries(delivery_id) on delete cascade,
  tank_number text not null,
  product_id uuid references public.products(product_id),
  before_reading numeric(10,2),
  after_reading numeric(10,2),
  water_reading numeric(10,2),
  receipt_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists trip_delivery_tanks_delivery_idx on public.trip_delivery_tanks (delivery_id);

-- One row per compartment filled. The compartment is the real unit: its own
-- order, supplier, BOL, pickup, and later its own delivery.
create table if not exists public.trip_compartment_loads (
  compartment_load_id uuid primary key,
  trip_id uuid not null references public.trips(trip_id) on delete cascade,
  pickup_id uuid references public.trip_pickups(pickup_id) on delete set null,
  order_id uuid references public.trip_orders(order_id) on delete set null,
  delivery_id uuid references public.trip_deliveries(delivery_id) on delete set null,
  comp_number integer not null check (comp_number > 0),
  product_id uuid references public.products(product_id),
  supplier text,
  bol_number text,
  gross_gallons numeric(10,2),
  net_gallons numeric(10,2),
  net_calculated_gallons numeric(10,2),   -- our number, kept for the edited-net flag
  temp_f numeric(6,1),
  api numeric(6,1),
  tank_number text,               -- delivery tank this compartment went into
  disposition text not null default 'loaded'
    check (disposition in ('loaded','delivered','retained','cancelled')),
  winterized boolean,
  additive_amount text,
  bio_blend text,
  loading_driver_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists trip_compartment_loads_trip_idx on public.trip_compartment_loads (trip_id, comp_number);

-- Shared policies + triggers for the trip child tables.
do $$
declare
  t text;
begin
  foreach t in array array['trip_orders','trip_pickups','trip_deliveries','trip_compartment_loads']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_newest', t);
    execute format(
      'create policy %I on public.%I for all using (public.trip_member(trip_id)) with check (public.trip_member(trip_id))',
      t || '_member', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.trip_touch_updated_at()',
      t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.trip_keep_newest_client_write()',
      t || '_newest', t);
  end loop;
end $$;

alter table public.trip_delivery_tanks enable row level security;
drop policy if exists trip_delivery_tanks_member on public.trip_delivery_tanks;
create policy trip_delivery_tanks_member on public.trip_delivery_tanks
  for all using (exists (
    select 1 from public.trip_deliveries d
    where d.delivery_id = trip_delivery_tanks.delivery_id and public.trip_member(d.trip_id)))
  with check (exists (
    select 1 from public.trip_deliveries d
    where d.delivery_id = trip_delivery_tanks.delivery_id and public.trip_member(d.trip_id)));
drop trigger if exists trip_delivery_tanks_touch on public.trip_delivery_tanks;
create trigger trip_delivery_tanks_touch before update on public.trip_delivery_tanks
  for each row execute function public.trip_touch_updated_at();
drop trigger if exists trip_delivery_tanks_newest on public.trip_delivery_tanks;
create trigger trip_delivery_tanks_newest before update on public.trip_delivery_tanks
  for each row execute function public.trip_keep_newest_client_write();

-- Append-only audit log: handoffs, reroutes, edits, arrivals.
create table if not exists public.trip_events (
  event_id uuid primary key,
  trip_id uuid not null references public.trips(trip_id) on delete cascade,
  event_type text not null check (length(event_type) > 0),
  occurred_at timestamptz not null,
  actor_id uuid not null references auth.users(id),
  pickup_id uuid references public.trip_pickups(pickup_id) on delete set null,
  delivery_id uuid references public.trip_deliveries(delivery_id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trip_events_trip_idx on public.trip_events (trip_id, occurred_at);

alter table public.trip_events enable row level security;

drop policy if exists trip_events_read on public.trip_events;
create policy trip_events_read on public.trip_events
  for select using (public.trip_member(trip_id));
drop policy if exists trip_events_insert on public.trip_events;
create policy trip_events_insert on public.trip_events
  for insert with check (public.trip_member(trip_id) and actor_id = auth.uid());
-- No update/delete: append-only.

-- ---------------------------------------------------------------------------
-- Compartment readiness (per trailer compartment)
-- ---------------------------------------------------------------------------
-- A missing row means cleaned_and_purged: every compartment starts there.

create table if not exists public.compartment_readiness (
  trailer_id uuid not null references public.trailers(trailer_id) on delete cascade,
  comp_number integer not null check (comp_number > 0),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  status text not null default 'cleaned_and_purged'
    check (status in ('cleaned_and_purged','preloaded','residue','retained')),
  last_product_id uuid references public.products(product_id),
  compartment_load_id uuid references public.trip_compartment_loads(compartment_load_id) on delete set null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz,
  primary key (trailer_id, comp_number)
);

alter table public.compartment_readiness enable row level security;

drop policy if exists compartment_readiness_read on public.compartment_readiness;
create policy compartment_readiness_read on public.compartment_readiness
  for select using (public.trip_company_member(company_id));
drop policy if exists compartment_readiness_insert on public.compartment_readiness;
create policy compartment_readiness_insert on public.compartment_readiness
  for insert with check (public.trip_company_member(company_id));
drop policy if exists compartment_readiness_update on public.compartment_readiness;
create policy compartment_readiness_update on public.compartment_readiness
  for update using (public.trip_company_member(company_id))
  with check (public.trip_company_member(company_id));

drop trigger if exists compartment_readiness_touch on public.compartment_readiness;
create trigger compartment_readiness_touch before update on public.compartment_readiness
  for each row execute function public.trip_touch_updated_at();
drop trigger if exists compartment_readiness_newest on public.compartment_readiness;
create trigger compartment_readiness_newest before update on public.compartment_readiness
  for each row execute function public.trip_keep_newest_client_write();

-- ---------------------------------------------------------------------------
-- Saved driver signature (drawn once, tap to accept after)
-- ---------------------------------------------------------------------------

create table if not exists public.driver_signatures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature_svg text not null check (length(signature_svg) > 0),
  updated_at timestamptz not null default now()
);

alter table public.driver_signatures enable row level security;

drop policy if exists driver_signatures_own on public.driver_signatures;
create policy driver_signatures_own on public.driver_signatures
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists driver_signatures_touch on public.driver_signatures;
create trigger driver_signatures_touch before update on public.driver_signatures
  for each row execute function public.trip_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Interior wash -> cleaned & purged
-- ---------------------------------------------------------------------------

alter table public.wash_records
  add column if not exists wash_type text not null default 'exterior';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wash_records_wash_type_check') then
    alter table public.wash_records
      add constraint wash_records_wash_type_check check (wash_type in ('exterior','interior'));
  end if;
end $$;

-- Which compartments an interior wash covered (null = all).
alter table public.wash_records
  add column if not exists interior_comp_numbers integer[];

commit;
