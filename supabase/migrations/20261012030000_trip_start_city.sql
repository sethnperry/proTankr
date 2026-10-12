-- Where a trip started: city/state recorded at Start Load, so the Dispatch
-- Dashboard's route line has a real start even on a truck's first trip.
-- Prefilled from the truck's last delivery or the phone's location; editable.
alter table public.trips add column if not exists start_city text;
alter table public.trips add column if not exists start_state text;
