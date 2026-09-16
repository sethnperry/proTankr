-- Cross-region "borrowed equipment" visibility.
--
-- Problem: the Equipment modal filters trucks/trailers by their permanent
-- home region/local_area. A Jacksonville-home trailer temporarily coupled
-- in Tampa (by broadening the filter) disappears from view the instant the
-- filter narrows back to Tampa -- even though the coupling itself is still
-- intact underneath (SoloEquipmentModal.tsx's own filteredTrucks/
-- filteredTrailers comment already notes a filtered-out selection stays
-- selected, just invisible).
--
-- Fix: track, with the least new schema possible, where a unit is CURRENTLY
-- being used -- derived from the coupling driver's own home region/local
-- area (profiles.region/local_area), stamped at the one event this app
-- already treats as an authoritative "physical custody changed" signal:
-- couple_combo. Home region/local_area (trucks.region/local_area etc.) is
-- completely unchanged -- it remains the permanent "whose equipment this
-- really is" record.
--
-- Requires 20260917000000_target_weight_policy.sql to be applied FIRST --
-- both migrations redefine couple_combo, and this one builds on that one's
-- bodies (adding the stamping step, keeping the target-resolution change).
--
-- NOT applied automatically -- run in the Supabase SQL editor, after
-- 20260917000000.

-- 1) Current-location columns ------------------------------------------------
-- Nullable, no FK -- matches the existing un-FK'd region/local_area columns
-- exactly. Only couple_combo (SECURITY DEFINER) writes these.
alter table public.trucks   add column if not exists current_region     text;
alter table public.trucks   add column if not exists current_local_area text;
alter table public.trailers add column if not exists current_region     text;
alter table public.trailers add column if not exists current_local_area text;

-- 2) couple_combo -- both overloads redefined again --------------------------
-- Verbatim copies of 20260917000000's bodies (target-resolution change
-- included), plus one addition: stamp current_region/current_local_area on
-- BOTH units from the coupling driver's own profile, on EVERY successful
-- couple (both the new-combo and the re-couple branch) -- a trailer swap
-- always calls couple_combo regardless of whether the pairing itself is
-- brand-new, so stamping can't be limited to the new-combo branch the way
-- the target-weight fix is.
--
-- `coalesce(v_driver_region, current_region)` means a driver with no
-- profile region set never regresses a unit's known current location to
-- null -- it's simply left as it was. No explicit "clear back to home"
-- logic exists or is needed: the next real couple event naturally
-- self-corrects it.

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
  -- home region/local area (see this migration's header comment).
  SELECT region, local_area INTO v_driver_region, v_driver_local_area
    FROM public._resolve_driver_location(auth.uid());

  UPDATE public.trucks SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area)
   WHERE truck_id = p_truck_id;
  UPDATE public.trailers SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area)
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
    current_local_area = COALESCE(v_driver_local_area, current_local_area)
   WHERE truck_id = p_truck_id;
  UPDATE public.trailers SET
    current_region     = COALESCE(v_driver_region, current_region),
    current_local_area = COALESCE(v_driver_local_area, current_local_area)
   WHERE trailer_id = p_trailer_id;

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;
