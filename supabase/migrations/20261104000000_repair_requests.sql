-- Repair requests (Truck Down). A driver reports a unit down; it goes to Deadline, a work order waits on one
-- approver, and one automatic email goes out with approve and deny links.
--   * trip_settings.repair_approver_email: the one address that approves repairs for the company.
--   * A "Repair" service type beside Wet and Dry (no interval: it is work done, not work due), so a finished
--     repair is logged in the unit's service history like any other service.

alter table public.trip_settings add column if not exists repair_approver_email text;

insert into public.service_types (company_id, name, interval_kind, applies_to, is_active)
select c.company_id, 'Repair', 'none', 'both', true
from public.companies c
where not exists (select 1 from public.service_types s where s.company_id = c.company_id and lower(s.name) = 'repair');
