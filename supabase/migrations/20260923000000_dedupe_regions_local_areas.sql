-- Dedupe equipment_regions/equipment_local_areas, and fold every free-text
-- region/local_area reference onto the surviving canonical spelling.
--
-- Real bug, not just a cosmetic duplicate-entries annoyance: per
-- 20260918000000_local_area_region_hierarchy.sql's own header comment,
-- EVERY name-based lookup in this app (couple_combo's own
-- _resolve_combo_target_weight, this app's admin region-scoping) "already
-- compares/matches by name only, never by id." The original
-- 2026-08-29 backfill (20260829010000_equipment_regions_local_areas.sql)
-- inserted one catalog row per DISTINCT text value already on
-- trucks/trailers at the time, with NO case/whitespace/abbreviation
-- normalization at all -- so "Ft. Myers" / "Ft.Myers" / "ft myers" /
-- "FT MYERS" all became separate rows, and any exact-string lookup
-- silently misses whichever variant it isn't looking for. Confirmed live
-- via a real screenshot of TargetWeightPolicyModal showing duplicate
-- "Ft. Myers" / "Jacksonville" / "Tampa" rows.
--
-- NOT applied automatically -- run in the Supabase SQL editor.
--
-- Every statement below is fully self-contained (a `with` CTE recomputes
-- the dedup mapping fresh, inline, every time it's needed) -- deliberately,
-- after two live failures ruled out anything that needs to survive between
-- statements: a `create temporary table` version failed with "relation ...
-- does not exist" on the very next statement, and switching to a real,
-- schema-qualified `public.` table hit the exact same error. Reproduced
-- the temp-table failure against a real throwaway Postgres by running
-- statements on separate connections (matching how the SQL editor
-- apparently executes a pasted multi-statement script) -- but a real
-- table survived that same test, and still failed for the user live,
-- meaning whatever the SQL editor is actually doing is stricter than that
-- reproduction captured. Rather than keep guessing at its execution model,
-- this version needs no object -- temp or permanent -- to exist beyond a
-- single statement, so it cannot be affected by however statements get
-- split, pooled, or routed.

-- ── 1) normalize_place_name ──────────────────────────────────────────────
-- The one normalization rule used everywhere below AND by the app going
-- forward (RequiredEquipmentFields.tsx's CatalogPicker checks against this
-- before inserting; see that file's own follow-up commit), so the DB and
-- the client can never disagree about what counts as "the same place."
-- Deliberately narrow: lowercases, strips ALL punctuation/whitespace, and
-- expands only three well-established, unambiguous US place-name
-- abbreviations (Ft->Fort, St->Saint, Mt->Mount) as whole words -- not
-- single-letter N/S/E/W (too easy to false-positive on unrelated text)
-- and not a broader guess at every conceivable abbreviation.
create or replace function public.normalize_place_name(p text)
returns text
language sql
immutable
as $function$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(trim(coalesce(p, ''))),
          '\mft\M', 'fort', 'g'
        ),
        '\mst\M', 'saint', 'g'
      ),
      '\mmt\M', 'mount', 'g'
    ),
    '[^a-z0-9]+', '', 'g'
  );
$function$;

-- ── 2) equipment_regions dedup ───────────────────────────────────────────
-- Canonical = oldest row (by created_at) in each (company_id,
-- normalized-name) group. A singleton group (no real duplicate) still maps
-- to itself as canonical -- which is what lets the same text-normalization
-- updates below also catch drifted free-text values against a catalog
-- entry that was never actually duplicated, not just genuine duplicate-
-- merge cases.

-- Coalesce a target_weight_override onto the canonical row when it has
-- none but a duplicate in its group does.
with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.equipment_regions er
   set target_weight_override = sub.override
  from (
    select m.canonical_id,
           (array_agg(er2.target_weight_override order by er2.created_at) filter (where er2.target_weight_override is not null))[1] as override
      from region_dedup_map m
      join public.equipment_regions er2 on er2.region_id = m.region_id
     group by m.canonical_id
  ) sub
 where er.region_id = sub.canonical_id
   and er.target_weight_override is null
   and sub.override is not null;

-- Re-point any local area whose region_id pointed at a duplicate onto the
-- surviving canonical region instead, before that duplicate is deactivated.
with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.equipment_local_areas la
   set region_id = m.canonical_id
  from region_dedup_map m
 where la.region_id = m.region_id
   and m.region_id <> m.canonical_id;

-- Fold every free-text reference (exact-match lookups everywhere else in
-- this app) onto the canonical spelling. `is distinct from` skips rows
-- that already match exactly, so this is a no-op write for anything not
-- actually affected.
with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.trucks t set region = m.canonical_name
  from region_dedup_map m
 where t.company_id = m.company_id and t.region is not null and t.region <> ''
   and public.normalize_place_name(t.region) = public.normalize_place_name(m.name)
   and t.region is distinct from m.canonical_name;

with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.trucks t set current_region = m.canonical_name
  from region_dedup_map m
 where t.company_id = m.company_id and t.current_region is not null and t.current_region <> ''
   and public.normalize_place_name(t.current_region) = public.normalize_place_name(m.name)
   and t.current_region is distinct from m.canonical_name;

with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.trailers t set region = m.canonical_name
  from region_dedup_map m
 where t.company_id = m.company_id and t.region is not null and t.region <> ''
   and public.normalize_place_name(t.region) = public.normalize_place_name(m.name)
   and t.region is distinct from m.canonical_name;

with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.trailers t set current_region = m.canonical_name
  from region_dedup_map m
 where t.company_id = m.company_id and t.current_region is not null and t.current_region <> ''
   and public.normalize_place_name(t.current_region) = public.normalize_place_name(m.name)
   and t.current_region is distinct from m.canonical_name;

-- profiles has no company_id of its own -- scoped via user_companies.
with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.profiles p
   set region = m.canonical_name
  from region_dedup_map m
  join public.user_companies uc on uc.company_id = m.company_id
 where p.user_id = uc.user_id
   and p.region is not null and p.region <> ''
   and public.normalize_place_name(p.region) = public.normalize_place_name(m.name)
   and p.region is distinct from m.canonical_name;

-- Deactivate the now-redundant duplicates (soft-delete only, matching this
-- catalog's own established "never a hard delete" precedent).
with region_dedup_map as (
  select
    region_id, company_id, name,
    first_value(region_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_regions
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, region_id asc)
)
update public.equipment_regions er
   set is_active = false
  from region_dedup_map m
 where er.region_id = m.region_id
   and m.region_id <> m.canonical_id;

-- ── 3) equipment_local_areas dedup ───────────────────────────────────────
-- Same shape as regions above, plus coalescing region_id itself (prefer
-- the canonical row's own region_id; take one from a duplicate only if
-- the canonical has none -- most pre-hierarchy rows have region_id null
-- per 20260918000000's own comment, so this matters in practice). Computed
-- AFTER step 2 above, so region_id values here already reflect the
-- canonical regions, not the deactivated duplicates.

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.equipment_local_areas la
   set target_weight_override = sub.override
  from (
    select m.canonical_id,
           (array_agg(la2.target_weight_override order by la2.created_at) filter (where la2.target_weight_override is not null))[1] as override
      from local_area_dedup_map m
      join public.equipment_local_areas la2 on la2.local_area_id = m.local_area_id
     group by m.canonical_id
  ) sub
 where la.local_area_id = sub.canonical_id
   and la.target_weight_override is null
   and sub.override is not null;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.equipment_local_areas la
   set region_id = sub.region_id
  from (
    select m.canonical_id,
           (array_agg(la2.region_id order by la2.created_at) filter (where la2.region_id is not null))[1] as region_id
      from local_area_dedup_map m
      join public.equipment_local_areas la2 on la2.local_area_id = m.local_area_id
     group by m.canonical_id
  ) sub
 where la.local_area_id = sub.canonical_id
   and la.region_id is null
   and sub.region_id is not null;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.trucks t set local_area = m.canonical_name
  from local_area_dedup_map m
 where t.company_id = m.company_id and t.local_area is not null and t.local_area <> ''
   and public.normalize_place_name(t.local_area) = public.normalize_place_name(m.name)
   and t.local_area is distinct from m.canonical_name;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.trucks t set current_local_area = m.canonical_name
  from local_area_dedup_map m
 where t.company_id = m.company_id and t.current_local_area is not null and t.current_local_area <> ''
   and public.normalize_place_name(t.current_local_area) = public.normalize_place_name(m.name)
   and t.current_local_area is distinct from m.canonical_name;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.trailers t set local_area = m.canonical_name
  from local_area_dedup_map m
 where t.company_id = m.company_id and t.local_area is not null and t.local_area <> ''
   and public.normalize_place_name(t.local_area) = public.normalize_place_name(m.name)
   and t.local_area is distinct from m.canonical_name;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.trailers t set current_local_area = m.canonical_name
  from local_area_dedup_map m
 where t.company_id = m.company_id and t.current_local_area is not null and t.current_local_area <> ''
   and public.normalize_place_name(t.current_local_area) = public.normalize_place_name(m.name)
   and t.current_local_area is distinct from m.canonical_name;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.profiles p
   set local_area = m.canonical_name
  from local_area_dedup_map m
  join public.user_companies uc on uc.company_id = m.company_id
 where p.user_id = uc.user_id
   and p.local_area is not null and p.local_area <> ''
   and public.normalize_place_name(p.local_area) = public.normalize_place_name(m.name)
   and p.local_area is distinct from m.canonical_name;

with local_area_dedup_map as (
  select
    local_area_id, company_id, name, region_id,
    first_value(local_area_id) over w as canonical_id,
    first_value(name) over w as canonical_name
  from public.equipment_local_areas
  where is_active
  window w as (partition by company_id, public.normalize_place_name(name) order by created_at asc, local_area_id asc)
)
update public.equipment_local_areas la
   set is_active = false
  from local_area_dedup_map m
 where la.local_area_id = m.local_area_id
   and m.local_area_id <> m.canonical_id;

-- ── 4) Prevent regression ────────────────────────────────────────────────
-- A partial unique index on the same normalized key -- can only be created
-- now that step 2/3 have already resolved every existing collision. Any
-- future insert bypassing the app's own pre-check (RequiredEquipmentFields.tsx's
-- CatalogPicker, fixed alongside this migration) hits this instead of
-- silently creating a fifth "Ft Myers" variant.
create unique index if not exists equipment_regions_unique_normalized_active
  on public.equipment_regions (company_id, public.normalize_place_name(name))
  where is_active;

create unique index if not exists equipment_local_areas_unique_normalized_active
  on public.equipment_local_areas (company_id, public.normalize_place_name(name))
  where is_active;
