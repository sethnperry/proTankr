-- The supplier dispatch picked for a pickup (shown to the driver on a dispatched load).
alter table public.trip_pickups add column if not exists supplier_id uuid references public.suppliers(supplier_id) on delete set null;
