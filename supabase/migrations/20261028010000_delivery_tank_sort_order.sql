-- Driver-chosen order of a store's tanks in the drop-into picker (east, center, west).
alter table public.delivery_location_tanks add column if not exists sort_order integer;
