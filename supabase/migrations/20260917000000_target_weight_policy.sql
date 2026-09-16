-- Fleet-tier target weight policy.
--
-- Problem: equipment_combos.target_weight only ever gets a real value when a
-- driver manually types it into the Scale Ticket modal. A brand-new combo
-- (e.g. after DecoupleModal.tsx's swap_truck/swap_trailer, which never pass
-- p_target_weight at all) silently falls back to a hardcoded 80000 inside
-- couple_combo -- not even this app's own 79,500 default -- so every
-- trailer/truck swap requires a manual fix-up in ScaleTicketModal afterward.
--
-- Fix: a company can set a target policy once (company-wide, via the
-- existing incentive_settings.target_gross_lbs), with optional overrides per
-- region and per local area (the existing equipment_regions/
-- equipment_local_areas catalogs). couple_combo resolves this automatically,
-- server-side, for any newly-created combo -- no client call site needs to
-- change, since couple_combo is the one choke point every coupling path
-- already goes through.
--
-- Governing input, decided with the user: the COUPLING DRIVER's own home
-- region/local_area (profiles.region/profiles.local_area) -- not either
-- piece of equipment's home area, since a truck and trailer can each have a
-- different one (that's the whole point of the companion "borrowed
-- equipment" migration, 20260917010000). ScaleTicketModal.tsx's existing
-- staff-only edit gate is UNCHANGED -- this migration only fixes what a new
-- combo gets auto-filled with; it does not touch who can edit it afterward.
--
-- NOT applied automatically -- run in the Supabase SQL editor. This
-- migration must be applied BEFORE 20260917010000, which builds on top of
-- the same couple_combo bodies redefined here.

-- 1) Region/local-area target overrides -----------------------------------
-- Nullable: null means "follow company policy" -- this IS the reset
-- mechanism, no separate boolean flag needed.
alter table public.equipment_regions add column if not exists target_weight_override numeric;
alter table public.equipment_local_areas add column if not exists target_weight_override numeric;

-- 2) Admin-gated writers for the override columns --------------------------
-- Deliberately NOT a bare .update() on the catalog row (unlike a plain
-- rename, which the existing update policy already allows any company
-- member to do) -- this number feeds payload-utilization/payroll math, so
-- writing it goes through an admin-checked RPC, matching
-- recalculate_load_points' own inline role-check shape.
create or replace function public.set_equipment_region_target(p_region_id uuid, p_target numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id  uuid;
  v_caller_role text;
begin
  select company_id into v_company_id from public.equipment_regions where region_id = p_region_id;
  if v_company_id is null then
    raise exception 'region_not_found: %', p_region_id;
  end if;

  select role into v_caller_role from public.user_companies
   where user_id = auth.uid() and company_id = v_company_id;
  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: only admin can set a region target';
  end if;

  update public.equipment_regions set target_weight_override = p_target where region_id = p_region_id;
end;
$function$;

grant execute on function public.set_equipment_region_target(uuid, numeric) to authenticated;

create or replace function public.set_equipment_local_area_target(p_local_area_id uuid, p_target numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id  uuid;
  v_caller_role text;
begin
  select company_id into v_company_id from public.equipment_local_areas where local_area_id = p_local_area_id;
  if v_company_id is null then
    raise exception 'local_area_not_found: %', p_local_area_id;
  end if;

  select role into v_caller_role from public.user_companies
   where user_id = auth.uid() and company_id = v_company_id;
  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: only admin can set a local area target';
  end if;

  update public.equipment_local_areas set target_weight_override = p_target where local_area_id = p_local_area_id;
end;
$function$;

grant execute on function public.set_equipment_local_area_target(uuid, numeric) to authenticated;

-- 3) Shared resolution helpers ----------------------------------------------
-- Not client-callable -- internal plumbing for couple_combo (and its
-- companion migration's current-region stamping, which needs the identical
-- driver-location lookup).
create or replace function public._resolve_driver_location(p_user_id uuid)
returns table(region text, local_area text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.region, p.local_area from public.profiles p where p.user_id = p_user_id;
$function$;

revoke execute on function public._resolve_driver_location(uuid) from public, anon, authenticated;

-- Resolution order, most specific first: the driver's own local_area
-- override > the driver's own region override > the company-wide
-- incentive_settings.target_gross_lbs > a hardcoded 79500 floor. Catalog
-- rows are matched by (company_id, name) against the driver's profile text,
-- the same un-FK'd matching trucks.region/local_area already use.
create or replace function public._resolve_combo_target_weight(p_company_id uuid, p_driver_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_region         text;
  v_local_area     text;
  v_region_target  numeric;
  v_area_target    numeric;
  v_company_target numeric;
begin
  select region, local_area into v_region, v_local_area
    from public._resolve_driver_location(p_driver_user_id);

  if v_local_area is not null then
    select target_weight_override into v_area_target
      from public.equipment_local_areas
     where company_id = p_company_id and name = v_local_area and is_active;
  end if;

  if v_region is not null then
    select target_weight_override into v_region_target
      from public.equipment_regions
     where company_id = p_company_id and name = v_region and is_active;
  end if;

  select target_gross_lbs into v_company_target
    from public.incentive_settings where company_id = p_company_id;

  return coalesce(v_area_target, v_region_target, v_company_target, 79500);
end;
$function$;

revoke execute on function public._resolve_combo_target_weight(uuid, uuid) from public, anon, authenticated;

-- 4) couple_combo -- both overloads redefined --------------------------------
-- Verbatim copies of 20260912000000_current_equipment_bobtail.sql's bodies,
-- with exactly one change each: the new-combo INSERT branch's hardcoded
-- `COALESCE(p_target_weight, 80000)` now resolves through the policy chain
-- above instead. The re-couple/existing-combo branch (line with
-- `target_weight = COALESCE(p_target_weight, target_weight)`) is untouched
-- -- an existing combo that already has a target keeps it.

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

  RETURN jsonb_build_object(
    'combo_id', v_combo_id,
    'tare_lbs', v_tare_lbs,
    'created',  v_created
  );
END;
$function$;
