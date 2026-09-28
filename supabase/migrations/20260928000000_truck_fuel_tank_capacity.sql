-- Fuel-burn weight correction (Load Report, 2026-09-28).
--
-- When a completed load's actual gross is over the 80,000 lb legal limit,
-- the Load Report lets the driver correct for fuel burned since the tare was
-- weighed (tare is taken with full saddle tanks). One way is "tank size +
-- gauge reading"; the tank size is remembered on the truck so a driver only
-- ever types it once.
--
-- 1. trucks.fuel_tank_gallons -- total saddle-tank capacity (all tanks
--    combined). Nullable: unknown until a driver/admin enters it.
--
-- 2. enforce_equipment_status_only_update() gains 'fuel_tank_gallons' in its
--    allow-list, so a plain fleet driver (the person actually in the truck)
--    can save it from the Load Report. Without this the trigger rejects the
--    write for any non-staff role. Built on the CURRENT body from
--    20260924000000 -- including the null-auth.uid() service-role bypass,
--    which two earlier migrations silently dropped by copying an older body.
--    Only the allow-list changes.
--
-- Additive and idempotent. The app fails open before this runs: the tank
-- field just doesn't save, and manual gallons entry still works.

alter table public.trucks add column if not exists fuel_tank_gallons numeric;

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
    'current_region', 'current_local_area', 'sub_status',
    'fuel_tank_gallons'
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
