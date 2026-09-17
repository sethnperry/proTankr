-- Sub-status catalog follow-up: scope entries by unit kind (truck/
-- trailer/both) and by which top-level status they apply under (deadline/
-- readyline/both) -- per explicit direction: "take the 'Available'
-- substatus out of the list when Deadline is selected... We should have a
-- list of sub-statuses specific to trucks and a list for trailers and its
-- different for deadline and readyline."
--
-- The starter list 20260920000000_equipment_sub_status.sql seeded
-- (Available/Parked/Maintenance/Inspection/Out of Service/Cleaning) was a
-- flat, unscoped condensation of DecoupleModal.tsx's real original
-- vocabulary (TRUCK_STATUSES/TRAILER_STATUSES, before this session's
-- 3-value collapse) -- this migration re-scopes those same rows onto that
-- original vocabulary's own distinctions rather than inventing a new one:
--   Truck:    AVAIL/PARK -> readyline; MAINT/INSP/OOS -> deadline
--             (BOBTAIL excluded -- it's "in transit," not deadline/
--             readyline, same exclusion DecoupleModal.tsx's own truck
--             picker already applied)
--   Trailer:  AVAIL/PARK/LOAD -> readyline; MAINT/INSP/OOS/CLEAN -> deadline
--
-- NOT applied automatically -- run in the Supabase SQL editor, after
-- 20260920000000_equipment_sub_status.sql.

-- 1) Scoping columns, defaulting to 'both' so any row this migration
--    doesn't touch (e.g. a company's own custom addition) stays visible
--    everywhere rather than silently disappearing.
alter table public.equipment_sub_statuses add column if not exists unit_kind text not null default 'both';
alter table public.equipment_sub_statuses add column if not exists status_scope text not null default 'both';

-- 2) Re-scope the existing starter rows -- Available/Parked apply to both
--    unit kinds under Readyline; Maintenance/Inspection/Out of Service
--    apply to both kinds under Deadline; Cleaning was trailer-only in the
--    original vocabulary (renamed to match its original fuller label).
update public.equipment_sub_statuses
   set status_scope = 'readyline'
 where name in ('Available', 'Parked');

update public.equipment_sub_statuses
   set status_scope = 'deadline'
 where name in ('Maintenance', 'Inspection', 'Out of Service');

update public.equipment_sub_statuses
   set status_scope = 'deadline', unit_kind = 'trailer', name = 'Cleaning / Purge'
 where name = 'Cleaning';

-- 3) "Loaded / Staged" -- trailer-only, readyline -- existed in the
--    original trailer vocabulary but wasn't part of the flat 6-value
--    starter seed.
insert into public.equipment_sub_statuses (company_id, name, unit_kind, status_scope)
select c.company_id, 'Loaded / Staged', 'trailer', 'readyline'
from public.companies c
where not exists (
  select 1 from public.equipment_sub_statuses s
   where s.company_id = c.company_id and s.name = 'Loaded / Staged'
);
