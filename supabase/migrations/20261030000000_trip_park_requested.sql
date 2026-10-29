-- Dispatch tells a driver to park a loaded trailer. The driver sees an alert and a "Park it" button;
-- the Parked chip counts the load as "Parking it" until the driver (or dispatch) parks it.
alter table public.trips add column if not exists park_requested_at timestamptz;
alter table public.trips add column if not exists park_requested_by uuid;
