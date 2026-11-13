-- Company setting: every BOL on a trip must be scanned before the trip can be closed. Off by default.
alter table public.trip_settings add column if not exists require_bol_scan boolean not null default false;
