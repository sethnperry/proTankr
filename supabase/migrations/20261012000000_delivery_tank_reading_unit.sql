-- Finish Delivery tank readings can be gallons (the store's tank monitor
-- printout) or inches (sticking the tank when the monitor is down; dispatch
-- converts with the tank chart). Water is always inches.
--
-- Purely additive. Re-runnable.

alter table public.trip_delivery_tanks
  add column if not exists reading_unit text not null default 'gallons';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trip_delivery_tanks_reading_unit_check'
  ) then
    alter table public.trip_delivery_tanks
      add constraint trip_delivery_tanks_reading_unit_check check (reading_unit in ('gallons', 'inches'));
  end if;
end $$;
