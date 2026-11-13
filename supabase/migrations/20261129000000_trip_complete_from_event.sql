-- A finished last delivery logs delivery_finished with trip_complete = true. If the trips row update that should
-- accompany it never reaches the server (lost sync), the trip stays open and the next driver on the trailer is
-- offered "Take over". Make the event itself close the trip.
create or replace function public.close_trip_on_complete_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'delivery_finished' and coalesce((new.payload->>'trip_complete')::boolean, false) then
    update public.trips set status = 'complete'
    where trip_id = new.trip_id and status in ('draft','loading','in_transit','delivering');
  end if;
  return new;
end $$;
drop trigger if exists trg_close_trip_on_complete_event on public.trip_events;
create trigger trg_close_trip_on_complete_event after insert on public.trip_events
for each row execute function public.close_trip_on_complete_event();
