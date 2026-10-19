-- Hose length a driver needs to reach each tank's fill at a delivery
-- location (tanks can sit at different distances from where the truck parks).
-- Shown on the delivery arrival screen. Additive only.
alter table public.delivery_location_tanks add column if not exists hose_length_ft numeric;
