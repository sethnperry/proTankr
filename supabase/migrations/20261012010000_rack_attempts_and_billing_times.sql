-- Rack hopping and billing time (2026-10-12).
--
-- Purely additive. Re-runnable.
--
-- 1. trip_pickups: a pickup can end without a load ("couldn't load here").
--    outcome = 'loaded' | 'no_load' (null while open). no_load_reason and
--    delay_code use the same terminal-issue codes the outage banner uses, so
--    one tap both explains the time on the PTD and warns other drivers.
-- 2. trip_settings: separate begin offsets for loading and delivery (the old
--    single begin_offset_minutes stays as the fallback).
-- 3. terminal_outage_reports: two terminal-wide report types, Long Line and
--    Terminal Issue. They aren't about one product, so product_id becomes
--    nullable. Like Out of Product they're shown to every company.

begin;

alter table public.trip_pickups
  add column if not exists outcome text,
  add column if not exists no_load_reason text,
  add column if not exists no_load_note text,
  add column if not exists delay_code text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_pickups_outcome_check') then
    alter table public.trip_pickups
      add constraint trip_pickups_outcome_check check (outcome is null or outcome in ('loaded', 'no_load'));
  end if;
end $$;

alter table public.trip_settings
  add column if not exists loading_begin_offset_minutes integer,
  add column if not exists delivery_begin_offset_minutes integer;

update public.trip_settings
set loading_begin_offset_minutes = coalesce(loading_begin_offset_minutes, begin_offset_minutes),
    delivery_begin_offset_minutes = coalesce(delivery_begin_offset_minutes, begin_offset_minutes);

alter table public.trip_settings
  alter column loading_begin_offset_minutes set default 10,
  alter column delivery_begin_offset_minutes set default 10;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_settings_loading_offset_check') then
    alter table public.trip_settings
      add constraint trip_settings_loading_offset_check
      check (loading_begin_offset_minutes is null or loading_begin_offset_minutes between 0 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_settings_delivery_offset_check') then
    alter table public.trip_settings
      add constraint trip_settings_delivery_offset_check
      check (delivery_begin_offset_minutes is null or delivery_begin_offset_minutes between 0 and 240);
  end if;
end $$;

alter table public.terminal_outage_reports alter column product_id drop not null;

alter table public.terminal_outage_reports drop constraint if exists terminal_outage_reports_report_type_check;
alter table public.terminal_outage_reports
  add constraint terminal_outage_reports_report_type_check
  check (report_type in ('out_of_product', 'out_of_allocation', 'long_line', 'terminal_issue'));

drop policy if exists terminal_outage_reports_select on public.terminal_outage_reports;
create policy terminal_outage_reports_select on public.terminal_outage_reports
  for select using (report_type <> 'out_of_allocation' or company_id = public.get_active_company_id());

commit;
