-- Per-terminal gauging override. Null = use the company default (trip_settings).
alter table public.terminals add column if not exists gauging_cutoff text;
alter table public.terminals add column if not exists gauging_minutes integer;
alter table public.terminals drop constraint if exists terminals_gauging_cutoff_fmt;
alter table public.terminals add constraint terminals_gauging_cutoff_fmt
  check (gauging_cutoff is null or gauging_cutoff ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.terminals drop constraint if exists terminals_gauging_minutes_range;
alter table public.terminals add constraint terminals_gauging_minutes_range
  check (gauging_minutes is null or (gauging_minutes >= 0 and gauging_minutes <= 720));
