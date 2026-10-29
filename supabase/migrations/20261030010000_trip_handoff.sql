-- A parked preloaded trailer taken over by another driver (they commandeer it in the equipment modal).
-- The new driver sees an alert on their dashboard until they dismiss it.
alter table public.trips add column if not exists handoff_at timestamptz;
alter table public.trips add column if not exists handoff_from uuid;
