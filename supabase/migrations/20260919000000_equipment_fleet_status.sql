-- Equipment fleet status: In Use / Deadline / Readyline via a STUD button.
--
-- trucks/trailers already have status_code/status_notes/status_location/
-- status_updated_at (migration 20260807000000_equipment_driver_permission_
-- split.sql's own trigger already allow-lists them as driver-writable) --
-- but the only writer today is DecoupleModal.tsx's admin-only decouple
-- flow, using an 8-value vocabulary (AVAIL/PARK/BOBTAIL/MAINT/INSP/OOS/
-- LOAD/CLEAN) built for "what is this unit doing and where," not the
-- 3-value fleet-readiness flag being added now. couple_combo never sets
-- status_code at all today, so a coupled unit's badge can show a stale
-- leftover value -- fixed here as a side effect.
--
-- Confirmed with the user: one shared vocabulary, not two. status_code
-- becomes exactly 'in_use' / 'deadline' / 'readyline' everywhere.
-- DecoupleModal.tsx's own status picker is remapped in app code (this
-- migration only touches the database); its richer reasons move into
-- status_notes as free text instead of a status code.
--
-- NOT applied automatically -- run in the Supabase SQL editor.

-- 0) Real, pre-existing bug found while writing this: enforce_equipment_
--    status_only_update() (20260807000000_equipment_driver_permission_
--    split.sql) allow-lists exactly 6 columns a non-staff caller may touch
--    on trucks/trailers -- status_code/status_location/status_lat/
--    status_lon/status_notes/status_updated_at. current_region/
--    current_local_area (added later, 20260917010000_current_region_
--    local_area.sql) were never added to that list -- so couple_combo's
--    own existing stamping of those two columns has been silently
--    aborting the ENTIRE couple_combo call for any plain (non-staff)
--    driver ever since, tripping this trigger's "Only status fields can
--    be updated by this role" exception. Never caught because this
--    project's own live testing has repeatedly been staff/admin-account
--    only (documented elsewhere as a known role-matrix testing gap). Both
--    couple_combo's existing stamping and this migration's own new
--    set_equipment_status RPC need these two columns allow-listed to work
--    for a non-staff caller at all.

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
    'current_region', 'current_local_area'
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

-- 1) Backfill existing status_code values onto the new vocabulary --------
-- Real existing values get a real new value; nothing silently collapses
-- to a false "in_use".
--   AVAIL, PARK, LOAD                -> readyline
--   MAINT, INSP, OOS, CLEAN          -> deadline
--   BOBTAIL, null, anything else     -> in_use
--   (including the never-actually-written 'COUPLED')

update public.trucks set status_code = case
  when status_code in ('AVAIL', 'PARK', 'LOAD') then 'readyline'
  when status_code in ('MAINT', 'INSP', 'OOS', 'CLEAN') then 'deadline'
  else 'in_use'
end;

update public.trailers set status_code = case
  when status_code in ('AVAIL', 'PARK', 'LOAD') then 'readyline'
  when status_code in ('MAINT', 'INSP', 'OOS', 'CLEAN') then 'deadline'
  else 'in_use'
end;

-- 2) couple_combo -- both overloads redefined again, verbatim copies of
--    20260917010000's bodies plus one addition: stamp status_code =
--    'in_use' on both units on every successful couple, right alongside
--    the existing current_region/current_local_area stamping.

create or replace function public.couple_combo(
  p_truck_id uuid,
  p_trailer_id uuid,
  p_tare_lbs numeric default null,
  p_target_weight numeric default null,
  p_buffer_lbs numeric default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_combo_id       uuid;
  v_tare_lbs       numeric;
  v_created        boolean := false;
  v_company_id     uuid;
  v_truck_co       uuid;
  v_trailer_co     uuid;
  v_truck_name     text;
  v_trailer_name   text;
  v_rec            record;
  v_driver_region     text;
  v_driver_local_area text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_company_id := get_active_company_id();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  SELECT company_id INTO v_truck_co   FROM public.trucks   WHERE truck_id   = p_truck_id;
  SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;
  IF v_truck_co IS NULL OR v_trailer_co IS NULL
     OR v_truck_co <> v_company_id
     OR v_trailer_co <> v_company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Release any combo the user currently holds
  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = auth.uid()
     AND active     = true;

  IF p_force THEN
    -- Per-unit take-over: other drivers keep their remaining unit.
    FOR v_rec IN
      SELECT combo_id FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
         AND claimed_by IS NOT NULL
         AND claimed_by <> auth.uid()
    LOOP
      PERFORM public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
    END LOOP;
    -- Mop up the caller's own (just-unclaimed) + any orphaned active combos
    -- holding either unit. Others are already inactive after the loop above.
    UPDATE public.equipment_combos
       SET active     = false,
           claimed_by = NULL,
           claimed_at = NULL
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
       AND active = true;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
    ) THEN
      RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
    END IF;
  END IF;

  SELECT combo_id, tare_lbs
    INTO v_combo_id, v_tare_lbs
    FROM public.equipment_combos
   WHERE truck_id   = p_truck_id
     AND trailer_id = p_trailer_id
     AND active     = false
   ORDER BY claimed_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.equipment_combos
       SET active        = true,
           claimed_by    = auth.uid(),
           claimed_at    = now(),
           company_id    = v_company_id,
           target_weight = COALESCE(p_target_weight, target_weight)
     WHERE combo_id = v_combo_id;
  ELSE
    IF p_tare_lbs IS NULL OR p_tare_lbs <= 0 THEN
      RAISE EXCEPTION 'No historical combo found. Please provide a tare weight.';
    END IF;

    SELECT truck_name   INTO v_truck_name   FROM public.trucks   WHERE truck_id   = p_truck_id;
    SELECT trailer_name INTO v_trailer_name FROM public.trailers WHERE trailer_id = p_trailer_id;

    v_combo_id := gen_random_uuid();
    v_tare_lbs := p_tare_lbs;

    INSERT INTO public.equipment_combos (
      combo_id, combo_name, truck_id, trailer_id,
      tare_lbs, target_weight,
      active, claimed_by, claimed_at, company_id
    ) VALUES (
      v_combo_id,
      COALESCE(v_truck_name, '') || ' / ' || COALESCE(v_trailer_name, ''),
      p_truck_id,
      p_trailer_id,
      p_tare_lbs,
      COALESCE(p_target_weight, public._resolve_combo_target_weight(v_company_id, auth.uid())),
      true,
      auth.uid(),
      now(),
      v_company_id
    );

    v_created := true;
  END IF;

  -- Record the caller's current units (a full pair).
  UPDATE public.user_settings
     SET current_truck_id   = p_truck_id,
         current_trailer_id = p_trailer_id,
         updated_at         = now()
   WHERE user_id = auth.uid();

  -- Stamp "current location" on both units from the coupling driver's own
  -- home region/local area (see 20260917010000's header comment), and mark
  -- both back in_use -- coupling is the one event that unambiguously means
  -- "this equipment is in service again."
  SELECT region, local_area INTO v_driver_region, v_driver_local_area
    FROM public._resolve_driver_location(auth.uid());

  UPDATE public.trucks SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area),
    status_code         = 'in_use'
   WHERE truck_id = p_truck_id;
  UPDATE public.trailers SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area),
    status_code         = 'in_use'
   WHERE trailer_id = p_trailer_id;

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;

create or replace function public.couple_combo(
  p_truck_id uuid,
  p_trailer_id uuid,
  p_user_id uuid,
  p_tare_lbs numeric default null,
  p_target_weight numeric default null,
  p_buffer_lbs numeric default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_combo_id       uuid;
  v_tare_lbs       numeric;
  v_created        boolean := false;
  v_company_id     uuid;
  v_truck_name     text;
  v_trailer_name   text;
  v_rec            record;
  v_driver_region     text;
  v_driver_local_area text;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(
    (SELECT active_company_id FROM public.user_settings WHERE user_id = p_user_id AND active_company_id IS NOT NULL),
    (SELECT company_id FROM public.user_companies WHERE user_id = p_user_id ORDER BY created_at LIMIT 1)
  ) INTO v_company_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  UPDATE public.equipment_combos
     SET claimed_by = NULL,
         claimed_at = NULL
   WHERE claimed_by = p_user_id
     AND active     = true;

  IF p_force THEN
    FOR v_rec IN
      SELECT combo_id FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
         AND claimed_by IS NOT NULL
         AND claimed_by <> p_user_id
    LOOP
      PERFORM public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
    END LOOP;
    UPDATE public.equipment_combos
       SET active     = false,
           claimed_by = NULL,
           claimed_at = NULL
     WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
       AND active = true;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.equipment_combos
       WHERE (truck_id = p_truck_id OR trailer_id = p_trailer_id)
         AND active = true
    ) THEN
      RAISE EXCEPTION 'One or both pieces of equipment are already coupled';
    END IF;
  END IF;

  SELECT combo_id, tare_lbs
    INTO v_combo_id, v_tare_lbs
    FROM public.equipment_combos
   WHERE truck_id   = p_truck_id
     AND trailer_id = p_trailer_id
     AND active     = false
   ORDER BY claimed_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.equipment_combos
       SET active        = true,
           claimed_by    = p_user_id,
           claimed_at    = now(),
           company_id    = v_company_id,
           target_weight = COALESCE(p_target_weight, target_weight)
     WHERE combo_id = v_combo_id;
  ELSE
    IF p_tare_lbs IS NULL OR p_tare_lbs <= 0 THEN
      RAISE EXCEPTION 'No historical combo found. Please provide a tare weight.';
    END IF;

    SELECT truck_name   INTO v_truck_name   FROM public.trucks   WHERE truck_id   = p_truck_id;
    SELECT trailer_name INTO v_trailer_name FROM public.trailers WHERE trailer_id = p_trailer_id;

    v_combo_id := gen_random_uuid();
    v_tare_lbs := p_tare_lbs;

    INSERT INTO public.equipment_combos (
      combo_id, combo_name, truck_id, trailer_id,
      tare_lbs, target_weight,
      active, claimed_by, claimed_at, company_id
    ) VALUES (
      v_combo_id,
      COALESCE(v_truck_name, '') || ' / ' || COALESCE(v_trailer_name, ''),
      p_truck_id,
      p_trailer_id,
      p_tare_lbs,
      COALESCE(p_target_weight, public._resolve_combo_target_weight(v_company_id, p_user_id)),
      true,
      p_user_id,
      now(),
      v_company_id
    );

    v_created := true;
  END IF;

  UPDATE public.user_settings
     SET current_truck_id   = p_truck_id,
         current_trailer_id = p_trailer_id,
         updated_at         = now()
   WHERE user_id = p_user_id;

  SELECT region, local_area INTO v_driver_region, v_driver_local_area
    FROM public._resolve_driver_location(p_user_id);

  UPDATE public.trucks SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area),
    status_code         = 'in_use'
   WHERE truck_id = p_truck_id;
  UPDATE public.trailers SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area),
    status_code         = 'in_use'
   WHERE trailer_id = p_trailer_id;

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;

-- 3) set_equipment_status -- the STUD RPC ------------------------------------
-- Open to any company member (not staff-only) -- matches the driver-
-- writable allow-list these status_* columns already had, and this app's
-- existing "crowdsourced STUD" precedent for terminal/rack status updates.
-- No DB check constraint on status_code itself, so a 4th status later
-- needs only an RPC + UI change (matches rack_arms.status's own
-- deliberately loose-text precedent).

create or replace function public.set_equipment_status(
  p_unit_kind text,
  p_unit_id uuid,
  p_status text,
  p_region text default null,
  p_local_area text default null,
  p_notes text default null
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

  -- Deadline/Readyline both mean "not currently with a driver" -- unlink
  -- from whoever holds it, same _evict_combo_to_partial mechanic
  -- couple_combo's own per-unit take-over already uses. The holder keeps
  -- whatever else they had (bobtail/trailer-only); nobody is really
  -- "claiming" this unit, but passing its own id as the claiming id is
  -- exactly the "this unit drops out of their held units" case the
  -- function already implements.
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
      current_local_area  = COALESCE(p_local_area, current_local_area)
     WHERE truck_id = p_unit_id;
  ELSE
    UPDATE public.trailers SET
      status_code         = p_status,
      status_notes        = p_notes,
      status_updated_at   = now(),
      current_region      = COALESCE(p_region, current_region),
      current_local_area  = COALESCE(p_local_area, current_local_area)
     WHERE trailer_id = p_unit_id;
  END IF;
END;
$function$;
