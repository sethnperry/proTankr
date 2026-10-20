-- The region a parked load sits in, so dispatch's region filter shows loads
-- parked in the region being worked, whoever's equipment or driver it is.
alter table public.trips add column if not exists parked_region text;
