-- A second pickup on a partly loaded trailer: which empty compartments it
-- fills and with what. Null = an ordinary pickup (the Planner plans freely).
-- Shape: [{"comp_number": 2, "product_id": "<uuid>"}, ...]
alter table public.trip_pickups add column if not exists planned_comps jsonb;
