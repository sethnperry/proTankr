-- Drop sequence: the allowance before the drop starts, the pump rate used to estimate the drop,
-- and the grace before time over the estimate counts as unaccounted. Plus where unaccounted
-- minutes are stored on a delivery.
alter table public.trip_settings add column if not exists delivery_prep_minutes integer not null default 15;
alter table public.trip_settings add column if not exists pump_gal_per_min integer not null default 450;
alter table public.trip_settings add column if not exists unaccounted_grace_minutes integer not null default 10;
alter table public.trip_deliveries add column if not exists unaccounted_delay_min integer;
