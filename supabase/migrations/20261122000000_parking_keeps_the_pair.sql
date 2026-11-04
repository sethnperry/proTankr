-- Parking at the end of a shift (Deadline or Readyline) must never split a pair. The old set_equipment_status evicted
-- the combo (_evict_combo_to_partial): it deactivated the pairing and left each driver holding only a trailer, so a
-- driver ending a shift decoupled their truck from their trailer, and a slip-seat partner's too. Now parking only
-- lets go of the unit: the claim is released and the holder's current_* cleared, and the pairing stays active, so the
-- pair is coupled and free for whoever takes it next. Decoupling happens only from the equipment modal.

CREATE OR REPLACE FUNCTION public.set_equipment_status(p_unit_kind text, p_unit_id uuid, p_status text, p_region text DEFAULT NULL::text, p_local_area text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_company uuid;
  v_company_id     uuid;
  v_combo_id       uuid;
  v_rec            record;
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

  -- Deadline/Readyline both mean "not currently with a driver": the holder lets go, the pairing stays.
  IF p_status IN ('deadline', 'readyline') THEN
    -- Let go of the unit; keep the pairing. Whoever held it no longer holds anything.
    FOR v_rec IN
      SELECT combo_id, claimed_by FROM public.equipment_combos
       WHERE active = true AND claimed_by IS NOT NULL
         AND ((p_unit_kind = 'truck' AND truck_id = p_unit_id)
           OR (p_unit_kind = 'trailer' AND trailer_id = p_unit_id))
    LOOP
      UPDATE public.equipment_combos SET claimed_by = NULL, claimed_at = NULL WHERE combo_id = v_rec.combo_id;
      UPDATE public.user_settings SET current_truck_id = NULL, current_trailer_id = NULL, updated_at = now() WHERE user_id = v_rec.claimed_by;
    END LOOP;
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

CREATE OR REPLACE FUNCTION public.set_equipment_status(p_unit_kind text, p_unit_id uuid, p_status text, p_region text DEFAULT NULL::text, p_local_area text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sub_status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_company uuid;
  v_company_id     uuid;
  v_combo_id       uuid;
  v_rec            record;
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
    -- Let go of the unit; keep the pairing. Whoever held it no longer holds anything.
    FOR v_rec IN
      SELECT combo_id, claimed_by FROM public.equipment_combos
       WHERE active = true AND claimed_by IS NOT NULL
         AND ((p_unit_kind = 'truck' AND truck_id = p_unit_id)
           OR (p_unit_kind = 'trailer' AND trailer_id = p_unit_id))
    LOOP
      UPDATE public.equipment_combos SET claimed_by = NULL, claimed_at = NULL WHERE combo_id = v_rec.combo_id;
      UPDATE public.user_settings SET current_truck_id = NULL, current_trailer_id = NULL, updated_at = now() WHERE user_id = v_rec.claimed_by;
    END LOOP;
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
