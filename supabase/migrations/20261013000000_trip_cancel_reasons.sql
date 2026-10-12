-- Cancel a load in progress (Driver Dashboard → Cancel load). Reasons
-- compound (traffic, then a rack hop, then gauging, then no allocation), so
-- they're a list, in the order the driver picked them. Managers see every
-- cancelled load on the Dispatch Dashboard; the driver can hide their own
-- from their Trips list (driver_hidden), which never hides it from managers.
alter table public.trips add column if not exists cancel_reasons text[];
alter table public.trips add column if not exists cancel_note text;
alter table public.trips add column if not exists cancelled_at timestamptz;
alter table public.trips add column if not exists cancelled_by uuid;
alter table public.trips add column if not exists cancel_returned_to text;
alter table public.trips add column if not exists driver_hidden boolean not null default false;

create index if not exists trips_company_cancelled_idx
  on public.trips (company_id, cancelled_at desc) where status = 'cancelled';
