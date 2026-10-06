-- Real bug, same class as 20260925000000_scope_unit_names_per_company.sql:
-- equipment_combos.combo_name is globally unique across the WHOLE table
-- (equipment_combos_combo_name_key, from 20260222172537_remote_schema.sql),
-- not scoped per company. combo_name is computed as "{truck_name} /
-- {trailer_name}" (both by couple_combo's own INSERT and, redundantly, by
-- the BEFORE INSERT/UPDATE trg_set_equipment_combo_name trigger -- either
-- way the persisted value is that same string), so any two DIFFERENT
-- companies whose drivers happen to pick the same truck+trailer numbers
-- collide on this constraint -- extremely likely with short/common unit
-- numbers, which is exactly what real drivers pick independently of each
-- other (the prior migration's own finding for truck_name/trailer_name
-- applies here verbatim).
--
-- Confirmed live 2026-10-06: a brand-new solo signup's very first
-- couple_combo call failed with "duplicate key value violates unique
-- constraint equipment_combos_combo_name_key" -- a second company's driver
-- had independently used the same truck/trailer numbers as an earlier
-- test account. First real-customer-facing hit of this bug class, not a
-- hypothetical.
--
-- Fix: drop the global unique constraint, replace with a company-scoped
-- one (company_id, combo_name). Safe by construction -- the OLD constraint
-- already guaranteed at most one row per combo_name in the ENTIRE table,
-- so no existing row can violate the new, strictly looser per-company
-- version.
--
-- NOT applied automatically -- run in the Supabase SQL editor.

alter table public.equipment_combos drop constraint if exists equipment_combos_combo_name_key;
create unique index if not exists equipment_combos_company_combo_name_key
  on public.equipment_combos (company_id, combo_name);
alter table public.equipment_combos
  add constraint equipment_combos_company_combo_name_key unique using index equipment_combos_company_combo_name_key;
