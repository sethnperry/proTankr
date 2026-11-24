-- Bio blended into a diesel compartment at the drop: the gallons the blender printed (nullable, null = no bio blended).
alter table public.trip_compartment_loads add column if not exists bio_gallons numeric;
