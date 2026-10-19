-- Hose length a driver needs at a delivery location, shown on the delivery
-- screen when they arrive. Feet. Optional.
alter table public.delivery_locations add column if not exists hose_length_ft numeric;
