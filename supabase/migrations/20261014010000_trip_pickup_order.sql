-- Which order a pickup loads under. A driver sent to more than one terminal
-- can load each under a different order number. Null = the trip's primary
-- order (the normal case).
alter table public.trip_pickups
  add column if not exists order_id uuid references public.trip_orders(order_id) on delete set null;
