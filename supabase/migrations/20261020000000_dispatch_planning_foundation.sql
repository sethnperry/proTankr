-- Dispatch planning, step 1: the record a dispatcher creates for a driver's
-- coming load, and a terminal on trailer certifications.
-- Purely additive. Nothing creates a 'dispatched' trip yet; the picker flow
-- (read-only) ships first.

begin;

alter table public.trips drop constraint if exists trips_status_check;
alter table public.trips add constraint trips_status_check
  check (status in ('dispatched','draft','loading','in_transit','delivering','parked','complete','cancelled'));

alter table public.trips
  add column if not exists dispatched_by uuid references auth.users(id),
  add column if not exists planned_start_at timestamptz,
  add column if not exists planned_truck_id uuid references public.trucks(truck_id) on delete set null,
  add column if not exists planned_trailer_id uuid references public.trailers(trailer_id) on delete set null,
  -- Load 1, 2, 3 for that driver's day.
  add column if not exists dispatch_seq integer;

-- A certification that only matters at one terminal ("Marathon trailer
-- certification"). Null = applies everywhere, as before.
alter table public.permit_types
  add column if not exists terminal_id uuid references public.terminals(terminal_id);

commit;
