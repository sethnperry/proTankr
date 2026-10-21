-- Company switch: stamp arrival from the truck's position when the stop's
-- geofence is learned (tight), and default the departure time to when the truck
-- really left. On by default; the driver can always correct a time.
alter table public.trip_settings add column if not exists auto_stamp_arrival boolean not null default true;
