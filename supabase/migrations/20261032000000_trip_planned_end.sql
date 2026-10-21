-- When a dispatched load is planned to finish and how much driving it holds, so the next load
-- planned for the same driver starts after it and the hours-of-service check counts it.
alter table public.trips add column if not exists planned_end_at timestamptz;
alter table public.trips add column if not exists planned_drive_min integer;
