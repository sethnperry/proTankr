-- Local areas belong to regions -- a real hierarchy, per explicit user
-- direction ("Obviously Local areas are inside regions"). Today
-- equipment_regions and equipment_local_areas (migration
-- 20260829010000_equipment_regions_local_areas.sql) are two flat,
-- unrelated company-scoped catalogs with no relationship at all.
--
-- Nullable -- the 2026-08-29 backfill already created local-area rows with
-- no region association (whatever distinct local_area text existed on
-- trucks/trailers at the time), and forcing NOT NULL here would break
-- them. Existing rows stay region_id = null ("unassigned") until a staff
-- member assigns one via RegionLocalAreaFilterModal.tsx's manage screen
-- (new capability shipped alongside this migration) -- same "future
-- entries only" precedent this catalog already uses for renames/removes.
--
-- trucks.region/local_area (and the trailer equivalents) are UNCHANGED --
-- still plain text, matching the existing "catalog feeds a free-text
-- field" design. Nothing else (couple_combo, _resolve_driver_location,
-- _resolve_combo_target_weight, the away-detection logic in
-- SoloEquipmentModal.tsx) needs to change -- all of them already compare/
-- match by name only, never by id.
--
-- NOT applied automatically -- run in the Supabase SQL editor.

alter table public.equipment_local_areas
  add column if not exists region_id uuid references public.equipment_regions(region_id);
