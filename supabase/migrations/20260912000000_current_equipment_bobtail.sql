-- ============================================================================
-- Equipment Phase 2 — persistent bobtail + per-unit take-over
-- ============================================================================
-- Adds a per-user "currently held units" layer so a driver can hold a truck
-- with no trailer (bobtail) or a trailer with no truck, and so grabbing ONE
-- unit from another driver leaves them holding the other instead of stripping
-- their whole combo (which is what couple_combo(p_force) does today).
--
--   * user_settings.current_truck_id / current_trailer_id      (nullable)
--   * _evict_combo_to_partial(combo, claiming_truck, claiming_trailer)  helper
--   * set_current_equipment(truck, trailer)  + service-role overload   (partial)
--   * couple_combo (both overloads) redefined: p_force now evicts OTHER
--     drivers per-unit (victim keeps their remaining unit) and records the
--     acting user's current_* on success.
--
-- Safety: this does NOT touch the tare/weight/load math or plan storage. A
-- partial (bobtail / trailer-only) state has no materialized combo, hence no
-- tare, and cannot load by construction. All existing couple_combo guards
-- (auth, company ownership, historical reuse, tare-required, target default)
-- are preserved verbatim; only the p_force victim handling changes, plus a
-- current_* write on success.
--
-- NOT auto-applied — run in the Supabase SQL editor. Verified first on a
-- throwaway PostgreSQL 16. Idempotent / safe to re-run.
-- ============================================================================

-- 1) Columns ------------------------------------------------------------------
alter table public.user_settings add column if not exists current_truck_id   uuid;
alter table public.user_settings add column if not exists current_trailer_id uuid;

-- 2) Shared eviction helper ---------------------------------------------------
-- Deactivate one active combo being (partially) taken and leave its owner
-- holding whichever of its two units is NOT being claimed by the new
-- selection: truck kept -> bobtail, trailer kept -> trailer-only, both taken
-- -> cleared. A NULL claiming_* means "not claiming that kind", so the owner
-- keeps that unit (NULL never equals a real uuid in the CASE below).
-- SECURITY DEFINER so it can write the victim's own user_settings row (RLS
-- would otherwise block a cross-user write). Not client-callable.
create or replace function public._evict_combo_to_partial(
  p_combo_id uuid,
  p_claiming_truck uuid,
  p_claiming_trailer uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_owner        uuid;
  v_truck        uuid;
  v_trailer      uuid;
  v_kept_truck   uuid;
  v_kept_trailer uuid;
BEGIN
  SELECT claimed_by, truck_id, trailer_id
    INTO v_owner, v_truck, v_trailer
    FROM public.equipment_combos
   WHERE combo_id = p_combo_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_kept_truck   := CASE WHEN v_truck   = p_claiming_truck   THEN NULL ELSE v_truck   END;
  v_kept_trailer := CASE WHEN v_trailer = p_claiming_trailer THEN NULL ELSE v_trailer END;

  UPDATE public.equipment_combos
     SET active = false, claimed_by = NULL, claimed_at = NULL
   WHERE combo_id = p_combo_id;

  IF v_owner IS NOT NULL THEN
    UPDATE public.user_settings
       SET current_truck_id   = v_kept_truck,
           current_trailer_id = v_kept_trailer,
           updated_at         = now()
     WHERE user_id = v_owner;
  END IF;
END;
$function$;

revoke execute on function public._evict_combo_to_partial(uuid, uuid, uuid) from public;
revoke execute on function public._evict_combo_to_partial(uuid, uuid, uuid) from anon;
revoke execute on function public._evict_combo_to_partial(uuid, uuid, uuid) from authenticated;

-- 3) set_current_equipment (partial selection, no tare) -----------------------
-- "I now hold exactly these units" — used when only ONE unit is selected
-- (bobtail / trailer-only). Both-null clears equipment; both-non-null is
-- rejected (a full pair must go through couple_combo, which needs a tare).
create or replace function public.set_current_equipment(
  p_truck_id uuid,
  p_trailer_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_company_id uuid;
  v_truck_co   uuid;
  v_trailer_co uuid;
  v_rec        record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_truck_id IS NOT NULL AND p_trailer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Use couple_combo for a full pair';
  END IF;

  v_company_id := get_active_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  -- Ownership: any non-null unit must belong to the caller's active company.
  IF p_truck_id IS NOT NULL THEN
    SELECT company_id INTO v_truck_co FROM public.trucks WHERE truck_id = p_truck_id;
    IF v_truck_co IS NULL OR v_truck_co <> v_company_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;
  IF p_trailer_id IS NOT NULL THEN
    SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;
    IF v_trailer_co IS NULL OR v_trailer_co <> v_company_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  -- Evict OTHER drivers holding the unit we're claiming (they keep the other).
  FOR v_rec IN
    SELECT combo_id FROM public.equipment_combos
     WHERE active = true
       AND claimed_by IS NOT NULL
       AND claimed_by <> auth.uid()
       AND ( (p_truck_id   IS NOT NULL AND truck_id   = p_truck_id)
          OR (p_trailer_id IS NOT NULL AND trailer_id = p_trailer_id) )
  LOOP
    PERFORM public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
  END LOOP;

  -- Dissolve the caller's own active combo(s): a partial selection has no
  -- materialized pair.
  UPDATE public.equipment_combos
     SET active = false, claimed_by = NULL, claimed_at = NULL
   WHERE claimed_by = auth.uid() AND active = true;

  -- Record what the caller now holds.
  UPDATE public.user_settings
     SET current_truck_id   = p_truck_id,
         current_trailer_id = p_trailer_id,
         updated_at         = now()
   WHERE user_id = auth.uid();
END;
$function$;

grant execute on function public.set_current_equipment(uuid, uuid) to authenticated;

-- 3b) service-role overload (admin "Use app as {driver}" impersonation) --------
-- Mirrors couple_combo's own service-role overload: acts for p_user_id, gated
-- to the service_role JWT, active-company resolution inlined for the target.
create or replace function public.set_current_equipment(
  p_truck_id uuid,
  p_trailer_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_company_id uuid;
  v_truck_co   uuid;
  v_trailer_co uuid;
  v_rec        record;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_truck_id IS NOT NULL AND p_trailer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Use couple_combo for a full pair';
  END IF;

  SELECT COALESCE(
    (SELECT active_company_id FROM public.user_settings WHERE user_id = p_user_id AND active_company_id IS NOT NULL),
    (SELECT company_id FROM public.user_companies WHERE user_id = p_user_id ORDER BY created_at LIMIT 1)
  ) INTO v_company_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company set. Please select a company first.';
  END IF;

  IF p_truck_id IS NOT NULL THEN
    SELECT company_id INTO v_truck_co FROM public.trucks WHERE truck_id = p_truck_id;
    IF v_truck_co IS NULL OR v_truck_co <> v_company_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;
  IF p_trailer_id IS NOT NULL THEN
    SELECT company_id INTO v_trailer_co FROM public.trailers WHERE trailer_id = p_trailer_id;
    IF v_trailer_co IS NULL OR v_trailer_co <> v_company_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  END IF;

  FOR v_rec IN
    SELECT combo_id FROM public.equipment_combos
     WHERE active = true
       AND claimed_by IS NOT NULL
       AND claimed_by <> p_user_id
       AND ( (p_truck_id   IS NOT NULL AND truck_id   = p_truck_id)
          OR (p_trailer_id IS NOT NULL AND trailer_id = p_trailer_id) )
  LOOP
    PERFORM public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
  END LOOP;

  UPDATE public.equipment_combos
     SET active = false, claimed_by = NULL, claimed_at = NULL
   WHERE claimed_by = p_user_id AND active = true;

  UPDATE public.user_settings
     SET current_truck_id   = p_truck_id,
         current_trailer_id = p_trailer_id,
         updated_at         = now()
   WHERE user_id = p_user_id;
END;
$function$;

revoke execute on function public.set_current_equipment(uuid, uuid, uuid) from public;
revoke execute on function public.set_current_equipment(uuid, uuid, uuid) from anon;
revoke execute on function public.set_current_equipment(uuid, uuid, uuid) from authenticated;

-- 4) couple_combo — client 6-arg overload (redefined) -------------------------
-- Verbatim copy of 20260907030000 EXCEPT: (a) the p_force branch evicts other
-- drivers per-unit via _evict_combo_to_partial (victim keeps their remaining
-- unit) before the blunt mop-up of the caller's own/orphaned combos, and
-- (b) the caller's current_truck_id/current_trailer_id are recorded on success.
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
  v_combo_id     uuid;
  v_tare_lbs     numeric;
  v_created      boolean := false;
  v_company_id   uuid;
  v_truck_co     uuid;
  v_trailer_co   uuid;
  v_truck_name   text;
  v_trailer_name text;
  v_rec          record;
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
      COALESCE(p_target_weight, 80000),
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

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;

-- 5) couple_combo — service-role 7-arg overload (redefined) --------------------
-- Verbatim copy of 20260815020000 with the same two changes as above, acting
-- for p_user_id.
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
  v_combo_id     uuid;
  v_tare_lbs     numeric;
  v_created      boolean := false;
  v_company_id   uuid;
  v_truck_name   text;
  v_trailer_name text;
  v_rec          record;
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
      COALESCE(p_target_weight, 80000),
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

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;
