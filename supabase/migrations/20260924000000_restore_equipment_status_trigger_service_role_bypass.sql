-- Restores a real regression: enforce_equipment_status_only_update() (trucks/
-- trailers' column-level driver-vs-staff write gate) lost its
-- `auth.uid() is null` bypass somewhere along the way.
--
-- History: 20260807000000_equipment_driver_permission_split.sql introduced
-- the trigger, staff-gated via is_company_staff(new.company_id). The very
-- same day, 20260808000000_equipment_status_trigger_service_role_fix.sql
-- added a null-auth-uid bypass, because is_company_staff() resolves against
-- auth.uid() internally and a service-role/system connection (no end-user
-- JWT) always has auth.uid() = null -- without the bypass, ANY trusted
-- server-side write touching a non-status column on trucks/trailers (a
-- migration run in the Supabase SQL editor included -- the SQL editor's own
-- connection has no JWT either) gets rejected as if it came from an
-- unprivileged driver.
--
-- 20260919000000_equipment_fleet_status.sql and 20260920000000_equipment_
-- sub_status.sql both `create or replace function
-- enforce_equipment_status_only_update()` to extend the status-column
-- allow-list (current_region/current_local_area, then sub_status) -- and
-- both of them were built directly off 20260807000000's original body, not
-- 20260808000000's fixed one, so the null-auth-uid bypass silently
-- disappeared again in the process. Confirmed live: running
-- 20260923000000_dedupe_regions_local_areas.sql (a plain SQL-editor script
-- updating trucks.region/current_region) failed with the exact "Only status
-- fields can be updated by this role" exception this bypass exists to
-- prevent.
--
-- Fix: re-add the null-auth-uid bypass, on top of the CURRENT (post-
-- 20260920000000) status-column allow-list -- verbatim, nothing else
-- changed. Idempotent (create or replace); safe to run again after this.

create or replace function public.enforce_equipment_status_only_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status_cols text[] := array[
    'status_code', 'status_location', 'status_lat', 'status_lon',
    'status_notes', 'status_updated_at',
    'current_region', 'current_local_area', 'sub_status'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.is_company_staff(new.company_id) then
    return new;
  end if;

  if (to_jsonb(old) - v_status_cols) is distinct from (to_jsonb(new) - v_status_cols) then
    raise exception 'Only status fields can be updated by this role';
  end if;

  return new;
end;
$function$;
