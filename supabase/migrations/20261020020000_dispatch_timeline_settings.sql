-- Dispatch timeline: company rules the forecast flags against.
begin;
alter table public.trip_settings
  -- A shift longer than this is flagged (the company's own limit, e.g. 12).
  add column if not exists max_shift_hours numeric not null default 12 check (max_shift_hours between 1 and 24),
  -- Most terminals gauge their tanks at midnight (terminal local time) and
  -- can't load while they do.
  add column if not exists gauging_cutoff time not null default '00:00',
  add column if not exists gauging_minutes integer not null default 60 check (gauging_minutes between 0 and 600);
commit;
