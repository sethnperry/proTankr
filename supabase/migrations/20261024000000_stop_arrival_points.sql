-- Where trucks actually are when a driver taps Arrive, recorded from telematics.
-- A few of these per terminal / delivery location give a precise geofence
-- center (catalog coordinates are often only city-level). Company members read
-- and add their own company's points.
create table if not exists public.stop_arrival_points (
  point_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  kind text not null check (kind in ('terminal', 'location')),
  ref_id text not null,
  lat double precision not null,
  lon double precision not null,
  recorded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists stop_arrival_points_ref on public.stop_arrival_points (company_id, kind, ref_id, created_at desc);

alter table public.stop_arrival_points enable row level security;

drop policy if exists stop_arrival_points_read on public.stop_arrival_points;
create policy stop_arrival_points_read on public.stop_arrival_points for select
  using (exists (select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = stop_arrival_points.company_id));

drop policy if exists stop_arrival_points_insert on public.stop_arrival_points;
create policy stop_arrival_points_insert on public.stop_arrival_points for insert
  with check (recorded_by = auth.uid() and exists (select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = stop_arrival_points.company_id));
