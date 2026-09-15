-- Per-compartment "Log the Load" verification -- complete_load fix +
-- Payload Utilization label flip (docs/incentive-redesign-plan.md).
--
-- NOT YET APPLIED to the live DB -- run in the Supabase SQL editor when
-- ready, per this project's standing pattern (CLAUDE.md "Architecture
-- reality" / "Operating posture").
--
-- ── Part 1: complete_load(payload jsonb) ────────────────────────────────────
--
-- Real bug being fixed: "Log the Load" used to ask for API/Temp once per
-- PRODUCT, then the app fanned that single reading out to every compartment
-- carrying that product via a SECOND jsonb_array_elements loop over
-- product_updates that had no comp_number filter at all -- it blindly
-- stamped actual_api onto every load_lines row matching that product_id.
-- Two compartments of the same product loaded a degree apart got force-
-- merged into one number.
--
-- The client now walks each compartment individually (see
-- LoadingModal.tsx's per-compartment sequence / useLoadWorkflow.ts's
-- onLoadedFromLoadingModal) and sends a real actual_api per LINE. Pass 1's
-- existing per-line loop is extended to write it; the old product-wide
-- clobbering loop is deleted outright -- Pass 1 now owns that column
-- entirely. load_lines.actual_api already exists in the base schema, so no
-- column migration is needed.
--
-- The second product_updates loop (writes the long-dead terminal_products
-- table -- unread anywhere in the app, per CLAUDE.md's "Fuel temp
-- prediction system" notes) is left completely unchanged: harmless, and out
-- of scope for this fix.

create or replace function public.complete_load(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_load_id        uuid;
  v_completed_at   timestamptz;
  v_user_id        uuid;
  v_status         text;
  v_terminal_id    uuid;
  v_planned_lbs    numeric;
  v_actual_total   numeric := 0;
  v_diff_lbs       numeric;
  v_line           jsonb;
  v_update         jsonb;
  v_comp           int;
  v_actual_gallons numeric;
  v_actual_lbs     numeric;
  v_actual_temp    numeric;
  v_actual_api     numeric;
  v_product_id     uuid;
  v_write_product_id uuid;
begin

  v_load_id      := (payload->>'load_id')::uuid;
  v_completed_at := coalesce(
                      (payload->>'completed_at')::timestamptz,
                      (payload->>'loaded_at')::timestamptz,
                      now()
                    );

  select user_id, status, terminal_id
    into v_user_id, v_status, v_terminal_id
    from load_log
   where load_id = v_load_id;

  if not found then
    raise exception 'load_not_found: %', v_load_id;
  end if;

  if v_user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  -- Removed already_completed guard — allows re-completion with updated values

  for v_line in select * from jsonb_array_elements(payload->'lines')
  loop
    v_comp           := (v_line->>'comp_number')::int;
    v_actual_gallons := (v_line->>'actual_gallons')::numeric;
    v_actual_lbs     := (v_line->>'actual_lbs')::numeric;
    v_actual_temp    := (v_line->>'temp_f')::numeric;
    v_actual_api     := (v_line->>'actual_api')::numeric;

    update load_lines
       set actual_gallons = v_actual_gallons,
           actual_lbs     = v_actual_lbs,
           actual_temp_f  = v_actual_temp,
           actual_api     = v_actual_api,
           updated_at     = now()
     where load_id    = v_load_id
       and comp_number = v_comp;
  end loop;

  -- (The old per-product actual_api clobbering loop lived here -- deleted;
  -- Pass 1 above now writes actual_api per compartment.)

  select coalesce(sum(actual_lbs), 0)
    into v_actual_total
    from load_lines
   where load_id = v_load_id
     and actual_lbs is not null;

  select coalesce(planned_total_lbs, 0)
    into v_planned_lbs
    from load_log
   where load_id = v_load_id;

  v_diff_lbs := v_actual_total - v_planned_lbs;

  update load_log
     set status           = 'loaded',
         completed_at     = v_completed_at,
         actual_total_lbs = v_actual_total,
         diff_lbs         = v_diff_lbs,
         updated_at       = now()
   where load_id = v_load_id;

  for v_update in select * from jsonb_array_elements(payload->'product_updates')
  loop
    v_product_id := (v_update->>'product_id')::uuid;
    v_actual_api := (v_update->>'api')::numeric;

    if v_actual_api is not null and v_actual_api > 0 then
      -- Pool onto the canonical product's row when this product is a
      -- rack-injected-variance flagged variant (e.g. dyed diesel) --
      -- falls back to its own id for every ungrouped product, unchanged.
      select coalesce(canonical_product_id, product_id) into v_write_product_id
        from products where product_id = v_product_id;

      -- Insert-if-missing, not a plain update: a terminal can curate only
      -- the variant (confirmed live -- Kinder Morgan offers dyed diesel
      -- with no plain D2 row at all), so the canonical row may not exist
      -- yet. `active` defaults to true on this table -- explicitly false
      -- on insert keeps an auto-created pooling row from silently becoming
      -- a new driver-selectable product nobody curated. On conflict
      -- (row already exists), `active` is deliberately left out of the
      -- SET clause so an existing curated row's flag is never touched.
      insert into terminal_products (terminal_id, product_id, active, last_api, updated_at)
      values (v_terminal_id, coalesce(v_write_product_id, v_product_id), false, v_actual_api, now())
      on conflict (terminal_id, product_id) do update
        set last_api   = excluded.last_api,
            updated_at = excluded.updated_at;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',               true,
    'load_id',          v_load_id,
    'planned_lbs',      v_planned_lbs,
    'actual_lbs',       v_actual_total,
    'diff_lbs',         v_diff_lbs,
    'completed_at',     v_completed_at
  );

exception
  when others then
    raise;
end;
$function$;

-- ── Part 2: record_load_utilization -- actual_gallons_source PLANNER -> DRIVER ──
--
-- With complete_load now receiving genuinely driver-entered per-compartment
-- gallons/API/temp (rather than a copy of the plan), actual_gallons is no
-- longer "what was planned" -- it's "what the driver confirmed at the rack."
-- The ONLY change from the version applied 2026-09-05 is the literal source
-- tag on the insert; every input/gate/eligibility computation is untouched.
-- See lib/capacity/computeUtilization.ts's own updated header comment for
-- the matching driver-facing label flip ("Plan Utilization" -> "Payload
-- Utilization").

create or replace function public.record_load_utilization(
  p_load_id  uuid,
  p_capacity jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_load               record;
  v_company_id         uuid;
  v_trailer_id         uuid;
  v_target             numeric;
  v_combo_target       numeric;
  v_legal              numeric;
  v_compartments       jsonb;
  v_actual_gallons     numeric;
  v_actual_lbs         numeric;
  v_actual_gross       numeric;
  v_overfilled         boolean;
  v_cap_gallons        numeric;
  v_available          numeric;
  v_effective          numeric;
  v_eligibility        text;
  v_exception          text;
  v_utilization        numeric;
  v_unused             numeric;
  v_calc_version       int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select ll.load_id, ll.user_id, ll.combo_id, ll.tare_lbs, ll.cg_bias, ll.loaded_at, ll.completed_at
    into v_load
    from load_log ll
   where ll.load_id = p_load_id;

  if not found then
    raise exception 'load_not_found: %', p_load_id;
  end if;

  -- Own-load only, matching calculate_load_points' own ownership check. An
  -- admin correcting someone else's load is a deliberate, audited action and
  -- belongs in its own function, not this one.
  if v_load.user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  v_company_id := get_active_company_id();
  if v_company_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_company');
  end if;

  -- ── Authoritative weight ceilings (never from the client) ──────────────
  -- The company target is the driver's 100% mark; the legal ceiling feeds
  -- fleet headroom only. Falls back to the documented defaults when a company
  -- has never opened the settings -- measurement must not require any
  -- configuration at all (spec TEST J/K).
  select coalesce(target_gross_lbs, 79500), coalesce(legal_gross_lbs, 80000)
    into v_target, v_legal
    from incentive_settings
   where company_id = v_company_id;

  if not found then
    v_target := 79500;
    v_legal  := 80000;
  end if;

  -- The per-combo target is the OPERATIVE ceiling when set: it is the number
  -- the Planner itself already plans against, so measuring against anything
  -- else would compare a load to a ceiling it was never planned for. The
  -- company value is the policy default behind it. This is safe to trust
  -- precisely because the same pass gates that field to staff -- if it were
  -- still driver-editable it would need clamping instead.
  --
  -- Assigned through scratch variables, not straight into v_target: a plpgsql
  -- SELECT INTO that matches no row sets its targets to NULL rather than
  -- leaving them alone, so a deleted or missing combo would silently null the
  -- company target resolved just above and take every downstream number with
  -- it.
  select ec.target_weight, ec.trailer_id
    into v_combo_target, v_trailer_id
    from equipment_combos ec
   where ec.combo_id = v_load.combo_id;

  v_target := coalesce(v_combo_target, v_target);

  if v_target is null or v_target <= 0 then
    v_target := 79500;
  end if;

  -- ── Actuals, from what complete_load already wrote ─────────────────────
  select coalesce(sum(actual_gallons), 0), coalesce(sum(actual_lbs), 0)
    into v_actual_gallons, v_actual_lbs
    from load_lines
   where load_id = p_load_id
     and actual_gallons is not null;

  v_actual_gross := coalesce(v_load.tare_lbs, 0) + v_actual_lbs;

  -- ── Safety gate, computed here and non-negotiable ──────────────────────
  -- Any compartment loaded past its CONFIGURED cap. cap_gallons is the real
  -- ceiling; max_gallons is informational only, per trailer_compartments' own
  -- established meaning in this app.
  v_overfilled := exists (
    select 1
      from load_lines ll
      join trailer_compartments tc
        on tc.trailer_id = v_trailer_id
       and tc.comp_number = ll.comp_number
     where ll.load_id = p_load_id
       and ll.actual_gallons is not null
       and ll.actual_gallons > coalesce(tc.cap_gallons, tc.max_gallons, 0) + 0.5
  );

  -- ── Server-derived snapshot inputs ─────────────────────────────────────
  -- Rebuilt from the database rather than accepted from the request, so the
  -- stored snapshot is a trustworthy record of what the load actually faced.
  -- Density inputs (api_60, alpha_per_f) come from products; the observed
  -- API and temperature come from load_lines, which is where the driver's own
  -- entry at completion already lives -- and, as of this migration, a real
  -- per-compartment value rather than one shared per-product figure.
  select coalesce(jsonb_agg(jsonb_build_object(
           'comp_number',          ll.comp_number,
           'position',             -coalesce(tc.position, 0),
           'cap_gallons',          coalesce(tc.cap_gallons, tc.max_gallons, 0),
           'cap_override_gallons', null,
           'product_id',           ll.product_id,
           'api_60',               p.api_60,
           'alpha_per_f',          p.alpha_per_f,
           'observed_api',         ll.actual_api,
           'observed_api_temp_f',  coalesce(ll.actual_temp_f, ll.temp_f),
           'temp_f',               coalesce(ll.actual_temp_f, ll.temp_f),
           'actual_gallons',       ll.actual_gallons
         ) order by ll.comp_number), '[]'::jsonb)
    into v_compartments
    from load_lines ll
    left join trailer_compartments tc
      on tc.trailer_id = v_trailer_id and tc.comp_number = ll.comp_number
    left join products p on p.product_id = ll.product_id
   where ll.load_id = p_load_id;

  v_calc_version := coalesce((p_capacity->>'calc_version')::int, 0);
  v_available    := coalesce((p_capacity->>'available_gallons')::numeric, 0);

  insert into load_capacity_snapshot (
    load_id, calc_version, tare_lbs, target_gross_lbs, legal_gross_lbs, cg_bias,
    compartments, available_gallons, available_payload_lbs,
    capacity_at_legal_gallons, total_volume_gallons, limiting_factor
  ) values (
    p_load_id, v_calc_version, coalesce(v_load.tare_lbs, 0), v_target, v_legal,
    coalesce(v_load.cg_bias, 0), v_compartments, v_available,
    coalesce((p_capacity->>'available_payload_lbs')::numeric, 0),
    coalesce((p_capacity->>'capacity_at_legal_gallons')::numeric, 0),
    coalesce((p_capacity->>'total_volume_gallons')::numeric, 0),
    coalesce(p_capacity->>'limiting_factor', 'none')
  )
  -- Idempotent, same as calculate_load_points was: safe to call twice for the
  -- same load without duplicating or corrupting the record.
  on conflict (load_id) do update set
    calc_version              = excluded.calc_version,
    tare_lbs                  = excluded.tare_lbs,
    target_gross_lbs          = excluded.target_gross_lbs,
    legal_gross_lbs           = excluded.legal_gross_lbs,
    cg_bias                   = excluded.cg_bias,
    compartments              = excluded.compartments,
    available_gallons         = excluded.available_gallons,
    available_payload_lbs     = excluded.available_payload_lbs,
    capacity_at_legal_gallons = excluded.capacity_at_legal_gallons,
    total_volume_gallons      = excluded.total_volume_gallons,
    limiting_factor           = excluded.limiting_factor;

  -- ── Automatic constraint from an Out of Allocation report ─────────────
  -- terminal_outage_reports already records "this terminal capped me on this
  -- product" -- it is the one external-constraint signal this app has today.
  -- It carries no gallon figure, which is exactly why it raises an
  -- UNQUANTIFIED constraint: enough to know the driver was capped, not enough
  -- to re-baseline them, so the load is excluded rather than measured against
  -- capacity it was never allowed to use.
  --
  -- It has to be a lookback rather than a link, because reporting Out of
  -- Allocation CANCELS the load it was reported from (CancelLoadSheet routes
  -- both report types to the card-renewal question, and both of its answers
  -- cancel). The capped driver then re-plans and loads what they were
  -- allowed, so the report and the load it constrains are always different
  -- loads.
  --
  -- 12 hours, deliberately NOT the banner's 6am/12pm/6pm/12am terminal-local
  -- clearing schedule: that schedule exists to decide how long a banner stays
  -- on screen, and reimplementing its timezone math here would be a second
  -- copy of app/planner/utils/dates.ts. A plain window is the honest fit for
  -- "was this driver capped here recently," and it is one shift wide.
  --
  -- The upper bound (the report must PRECEDE the load) is not just tidiness:
  -- an excluded load is one that can't drag a driver's average down, so
  -- without it a driver could file a report after a poor load to retire it
  -- from their own numbers. Filing one beforehand is still possible, but it
  -- also raises a company-visible banner, so it isn't free or invisible.
  insert into load_constraints (load_id, constraint_type, constrained_gallons, source, notes, created_by)
  select p_load_id, 'terminal_cap', null::numeric, 'DRIVER',
         'Auto-linked from an Out of Allocation report at this terminal.', v_load.user_id
   where exists (
     select 1
       from terminal_outage_reports r
       join load_lines ll2 on ll2.load_id = p_load_id and ll2.product_id = r.product_id
       join load_log ll3 on ll3.load_id = p_load_id
      where r.report_type = 'out_of_allocation'
        and r.reporter_user_id = v_load.user_id
        and r.terminal_id = ll3.terminal_id
        and r.created_at >= coalesce(v_load.loaded_at, v_load.completed_at, now()) - interval '12 hours'
        and r.created_at <= coalesce(v_load.loaded_at, v_load.completed_at, now())
   )
     -- Idempotent: this function may run more than once for a load, and the
     -- auto-link must not stack up duplicate constraint rows.
     and not exists (
       select 1 from load_constraints lc
        where lc.load_id = p_load_id and lc.constraint_type = 'terminal_cap'
     );

  -- ── External constraints (spec section 11) ─────────────────────────────
  -- Lowest quantified cap wins. A constraint with no gallon figure is still
  -- meaningful: it proves the driver was capped without saying by how much.
  select min(constrained_gallons)
    into v_effective
    from load_constraints
   where load_id = p_load_id and constrained_gallons is not null;

  if v_effective is not null then
    -- A cap can only ever narrow. One above real capacity constrained nothing.
    v_effective := least(v_available, v_effective);
  else
    v_effective := v_available;
  end if;

  -- ── Eligibility ────────────────────────────────────────────────────────
  if v_available <= 0 or v_actual_gallons < 0 then
    v_eligibility := 'excluded_incomplete_data';
    v_exception   := 'Available capacity or actual gallons could not be established for this load.';
  elsif v_actual_gross > v_legal then
    v_eligibility := 'excluded_safety';
    v_exception   := format('Actual gross weight exceeded the legal limit of %s lbs.', round(v_legal));
  elsif v_overfilled then
    v_eligibility := 'excluded_safety';
    v_exception   := 'A compartment was loaded beyond its configured cap.';
  elsif exists (
    select 1 from load_constraints
     where load_id = p_load_id and constrained_gallons is null
  ) then
    v_eligibility := 'excluded_constraint';
    v_exception   := 'This load was capped by an external constraint of unknown size, so it is excluded rather than measured against full capacity.';
  else
    v_eligibility := 'eligible';
    v_exception   := case when v_effective < v_available
      then format('Measured against an external cap of %s gal rather than full capacity.', round(v_effective))
      else null end;
  end if;

  if v_eligibility = 'eligible' then
    -- Deliberately NOT clamped at 100. With the company target as the
    -- denominator, above target but under the legal ceiling is a real, legal,
    -- well-loaded trip, and clamping would erase the difference between
    -- hitting the target and safely beating it.
    v_utilization := (v_actual_gallons / nullif(v_effective, 0)) * 100;
  else
    v_utilization := null;
  end if;

  v_unused := greatest(0, v_effective - v_actual_gallons);

  insert into load_utilization (
    load_id, driver_id, company_id, loaded_at,
    available_gallons, effective_available_gallons, actual_gallons,
    unused_gallons, utilization_pct, eligibility, exception_reason,
    actual_gallons_source, calc_version, updated_at
  ) values (
    p_load_id, v_load.user_id, v_company_id,
    coalesce(v_load.loaded_at, v_load.completed_at, now()),
    v_available, v_effective, v_actual_gallons,
    v_unused, v_utilization, v_eligibility, v_exception,
    -- actual_gallons is now a real per-compartment driver confirmation (see
    -- this migration's own header comment) -- stamped DRIVER, not PLANNER.
    'DRIVER', v_calc_version, now()
  )
  on conflict (load_id) do update set
    driver_id                   = excluded.driver_id,
    company_id                  = excluded.company_id,
    loaded_at                   = excluded.loaded_at,
    available_gallons           = excluded.available_gallons,
    effective_available_gallons = excluded.effective_available_gallons,
    actual_gallons              = excluded.actual_gallons,
    unused_gallons              = excluded.unused_gallons,
    utilization_pct             = excluded.utilization_pct,
    eligibility                 = excluded.eligibility,
    exception_reason            = excluded.exception_reason,
    actual_gallons_source       = excluded.actual_gallons_source,
    calc_version                = excluded.calc_version,
    updated_at                  = now();

  return jsonb_build_object(
    'ok', true,
    'available_gallons', v_available,
    'effective_available_gallons', v_effective,
    'actual_gallons', v_actual_gallons,
    'unused_gallons', v_unused,
    'utilization_pct', v_utilization,
    'eligibility', v_eligibility,
    'exception_reason', v_exception,
    'limiting_factor', p_capacity->>'limiting_factor'
  );
end;
$function$;
