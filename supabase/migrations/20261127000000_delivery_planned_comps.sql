-- A load with more than one drop: which compartments are delivered at each stop.
-- Null = an ordinary single drop. Shape: [{"comp_number": 3}, ...]
alter table public.trip_deliveries add column if not exists planned_comps jsonb;
