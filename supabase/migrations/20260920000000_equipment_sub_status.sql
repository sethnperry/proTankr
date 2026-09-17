-- Equipment fleet status follow-up: sub-status catalog + bug fixes from
-- real usage of the STUD button shipped in 20260919000000.
--
-- Real bugs found and fixed in that same pass, client-side only (no schema
-- change needed for those): deadlining a trailer was auto-showing the
-- truck re-paired with a stale, unrelated trailer name (a client-side
-- staleness bug in SoloEquipmentModal.tsx/useEquipment.ts, not a server
-- bug) and the header no longer shows "(Deadline)"/"(Readyline)" next to
-- a currently-linked unit at all -- see SoloEquipmentModal.tsx's own
-- comments for the full trace. This migration is the one NEW feature from
-- that same follow-up: a "sub-status" dropdown (Maintenance/Inspection/
-- Available/Parked/etc.), styled and managed exactly like the existing
-- Region/Local Area catalogs, recovering some of the granularity that was
-- deliberately collapsed out of status_code when it went from the old
-- 8-value DecoupleModal.tsx vocabulary down to the new 3-value one.
--
-- NOT applied automatically -- run in the Supabase SQL editor, after
-- 20260919000000_equipment_fleet_status.sql.

-- 1) New catalog table, mirrors equipment_regions/equipment_local_areas
--    exactly (20260829010000_equipment_regions_local_areas.sql) --
--    company-scoped, soft-delete only, no DB-level role gate (UI gates
--    add/edit to whoever can already reach the STUD modal, same as every
--    other catalog here). Not scoped by region or by top-level status --
--    a single flat, company-curated list shared by both Deadline and
--    Readyline (e.g. "Available"/"Parked" apply to Readyline,
--    "Maintenance"/"Inspection"/"Out of Service"/"Cleaning" to Deadline,
--    but nothing stops an admin from adding more of either kind).
create table if not exists public.equipment_sub_statuses (
  sub_status_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.equipment_sub_statuses enable row level security;

create policy equipment_sub_statuses_select_active_company on public.equipment_sub_statuses
  for select using (company_id = get_active_company_id());
create policy equipment_sub_statuses_insert_active_company on public.equipment_sub_statuses
  for insert with check (company_id = get_active_company_id());
create policy equipment_sub_statuses_update_active_company on public.equipment_sub_statuses
  for update using (company_id = get_active_company_id());
create policy equipment_sub_statuses_delete_active_company on public.equipment_sub_statuses
  for delete using (company_id = get_active_company_id());

-- Starter list per existing company -- there's no historical column to
-- backfill from (this is a brand-new field), but seeding a reasonable
-- starting set (drawn from the old 8-value vocabulary's own reasons) means
-- a company doesn't open an empty dropdown on day one. Renamable/
-- removable like any other catalog entry -- not a fixed enum.
insert into public.equipment_sub_statuses (company_id, name)
select c.company_id, v.name
from public.companies c
cross join (values
  ('Available'), ('Parked'), ('Maintenance'),
  ('Inspection'), ('Out of Service'), ('Cleaning')
) as v(name)
where not exists (
  select 1 from public.equipment_sub_statuses s
   where s.company_id = c.company_id and s.name = v.name
);

-- 2) sub_status column on trucks/trailers -- plain nullable text, no FK to
--    the catalog above (matches region/local_area's own precedent: the
--    catalog is a managed pick-list feeding a free text column, not a
--    foreign key).
alter table public.trucks   add column if not exists sub_status text;
alter table public.trailers add column if not exists sub_status text;

-- 3) Trigger allow-list -- sub_status must be writable by a non-staff
--    caller the same way status_code/status_notes/current_region/
--    current_local_area already are, or set_equipment_status silently
--    fails for any plain (non-staff) driver, same class of bug fixed in
--    20260919000000 for current_region/current_local_area.
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
  if public.is_company_staff(new.company_id) then
    return new;
  end if;

  if (to_jsonb(old) - v_status_cols) is distinct from (to_jsonb(new) - v_status_cols) then
    raise exception 'Only status fields can be updated by this role';
  end if;

  return new;
end;
$function$;

-- 4) set_equipment_status -- extended with a trailing p_sub_status param.
--    CREATE OR REPLACE can append a new parameter with a default without
--    dropping/recreating (same identity, same grants) as long as it's
--    added at the end with a default -- confirmed safe per Postgres docs,
--    no DROP needed here unlike a changed/removed parameter.
--    Directly overwrites (not COALESCE) same as status_notes already
--    does -- the modal always sends its current picker value, including
--    an explicit clear-to-null, so "keep what was there if not passed"
--    doesn't apply the way it does for region/local_area (which can be
--    updated from other, unrelated flows that never touch sub_status).
create or replace function public.set_equipment_status(
  p_unit_kind text,
  p_unit_id uuid,
  p_status text,
  p_region text default null,
  p_local_area text default null,
  p_notes text default null,
  p_sub_status text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_active_company uuid;
  v_company_id     uuid;
  v_combo_id       uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_unit_kind NOT IN ('truck', 'trailer') THEN
    RAISE EXCEPTION 'Invalid unit kind: %', p_unit_kind;
  END IF;

  IF p_status NOT IN ('in_use', 'deadline', 'readyline') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  v_active_company := get_active_company_id();
  IF v_active_company IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  IF p_unit_kind = 'truck' THEN
    SELECT company_id INTO v_company_id FROM public.trucks WHERE truck_id = p_unit_id;
  ELSE
    SELECT company_id INTO v_company_id FROM public.trailers WHERE trailer_id = p_unit_id;
  END IF;

  IF v_company_id IS NULL OR v_company_id <> v_active_company THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status IN ('deadline', 'readyline') THEN
    SELECT combo_id INTO v_combo_id
      FROM public.equipment_combos
     WHERE active = true
       AND (
         (p_unit_kind = 'truck' AND truck_id = p_unit_id)
         OR (p_unit_kind = 'trailer' AND trailer_id = p_unit_id)
       )
     LIMIT 1;

    IF v_combo_id IS NOT NULL THEN
      PERFORM public._evict_combo_to_partial(
        v_combo_id,
        CASE WHEN p_unit_kind = 'truck' THEN p_unit_id ELSE NULL END,
        CASE WHEN p_unit_kind = 'trailer' THEN p_unit_id ELSE NULL END
      );
    END IF;
  END IF;

  IF p_unit_kind = 'truck' THEN
    UPDATE public.trucks SET
      status_code         = p_status,
      status_notes        = p_notes,
      status_updated_at   = now(),
      current_region      = COALESCE(p_region, current_region),
      current_local_area  = COALESCE(p_local_area, current_local_area),
      sub_status          = p_sub_status
     WHERE truck_id = p_unit_id;
  ELSE
    UPDATE public.trailers SET
      status_code         = p_status,
      status_notes        = p_notes,
      status_updated_at   = now(),
      current_region      = COALESCE(p_region, current_region),
      current_local_area  = COALESCE(p_local_area, current_local_area),
      sub_status          = p_sub_status
     WHERE trailer_id = p_unit_id;
  END IF;
END;
$function$;
