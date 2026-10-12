-- Park Preloaded: a loaded trailer staged for a slip-seat driver or for the
-- same driver after a layover. The trip keeps its load; status 'parked' frees
-- the driver to start another trip, and whoever picks up the trailer resumes it.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.trips'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.trips drop constraint %I', c);
  end loop;
end $$;

alter table public.trips add constraint trips_status_check
  check (status in ('draft','loading','in_transit','delivering','parked','complete','cancelled'));

alter table public.trips add column if not exists parked_at timestamptz;
alter table public.trips add column if not exists parked_by uuid references auth.users(id);
alter table public.trips add column if not exists parked_for text
  check (parked_for is null or parked_for in ('slip_seat','layover'));
alter table public.trips add column if not exists parked_where text;
alter table public.trips add column if not exists parked_note text;
