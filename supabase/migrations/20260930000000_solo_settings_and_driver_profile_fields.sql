-- Solo-tier Dashboard cleanup + Settings merge: adds a driver-facing
-- employment-type field (visible like any other profile field, admin can
-- see/edit it same as hire_date/division) plus a private, driver-only
-- "Pay & Schedule" notes area (never company-visible -- personal reminders
-- only, e.g. "I'm paid weekly, Wed-Wed, direct deposit Saturday").
--
-- employment_type rides on the existing upsert_driver_profile RPC (body
-- reproduced verbatim from 20260907150000_secdef_target_membership_checks.sql,
-- the most recent migration to touch it, extended only to also read/write
-- this one new column -- same signature, so this is a safe CREATE OR REPLACE,
-- not a drop-and-recreate).
--
-- driver_pay_settings is a NEW table, not a new column on profiles, because
-- the privacy model is different: profiles has no company_id and no
-- meaningful "personal-only" RLS carve-out today (its columns are all
-- visible to any company admin editing a member via upsert_driver_profile's
-- admin branch). Pay/schedule data must never be admin-visible, so it needs
-- its own table with straightforward self-only row-level security rather
-- than trying to bolt column-level privacy onto profiles. Shape mirrors
-- driver_schedules (one row per user_id, typed columns, not jsonb) but with
-- the opposite RLS -- that table is staff-visible, this one is strictly
-- self-only.

alter table public.profiles
  add column if not exists employment_type text
  check (employment_type in ('company_driver', 'lease_operator', 'owner_operator'));

create table if not exists public.driver_pay_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pay_period_type text check (pay_period_type in ('weekly', 'biweekly', 'semi_monthly', 'monthly')),
  payday_day_of_week text check (payday_day_of_week in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday')),
  notes text,
  -- Only ever shown/edited when employment_type is lease_operator or
  -- owner_operator (DriverProfileModal.tsx's own field-set-by-type logic) --
  -- kept as its own column rather than folded into `notes` so it can be its
  -- own labeled field in the UI ("Lease / Owner-Operator Details") distinct
  -- from the general catch-all Notes field.
  lease_details text,
  updated_at timestamptz not null default now()
);

alter table public.driver_pay_settings enable row level security;

-- Self-only, no admin/staff carve-out anywhere -- this is the entire point
-- of the table existing separately from profiles.
create policy driver_pay_settings_self on public.driver_pay_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── upsert_driver_profile ──────────────────────────────────────────────────
-- Body verbatim from 20260907150000_secdef_target_membership_checks.sql
-- except: profiles INSERT/UPDATE column list gains employment_type. Every
-- other table/branch (license/medical/twic/port_ids) is byte-for-byte
-- unchanged.
CREATE OR REPLACE FUNCTION public.upsert_driver_profile(p_user_id uuid, p_company_id uuid, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lic  jsonb;
  v_med  jsonb;
  v_twic jsonb;
  v_port jsonb;
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM user_companies WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin')
      AND EXISTS (SELECT 1 FROM user_companies WHERE user_id = p_user_id AND company_id = p_company_id)
    )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO profiles (user_id, display_name, hire_date, division, region, local_area, employee_number, employment_type)
  VALUES (p_user_id, p_data->>'display_name', NULLIF(p_data->>'hire_date','')::date,
    p_data->>'division', p_data->>'region', p_data->>'local_area', p_data->>'employee_number',
    NULLIF(p_data->>'employment_type',''))
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, hire_date = EXCLUDED.hire_date,
    division = EXCLUDED.division, region = EXCLUDED.region,
    local_area = EXCLUDED.local_area, employee_number = EXCLUDED.employee_number,
    employment_type = EXCLUDED.employment_type;

  v_lic := p_data->'license';
  IF v_lic IS NOT NULL AND v_lic != 'null'::jsonb THEN
    INSERT INTO driver_licenses (user_id, company_id, license_class, license_number, state_code,
      endorsements, restrictions, issue_date, expiration_date,
      hazmat_linked_to_license, hazmat_issue_date, hazmat_expiration_date, updated_at)
    VALUES (p_user_id, p_company_id,
      v_lic->>'license_class', v_lic->>'license_number', v_lic->>'state_code',
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(v_lic->'endorsements') x), '{}'),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(v_lic->'restrictions') x), '{}'),
      NULLIF(v_lic->>'issue_date','')::date,
      NULLIF(v_lic->>'expiration_date','')::date,
      COALESCE((v_lic->>'hazmat_linked_to_license')::boolean, false),
      NULLIF(v_lic->>'hazmat_issue_date','')::date,
      NULLIF(v_lic->>'hazmat_expiration_date','')::date,
      now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      license_class = EXCLUDED.license_class,
      license_number = EXCLUDED.license_number,
      state_code = EXCLUDED.state_code,
      endorsements = EXCLUDED.endorsements,
      restrictions = EXCLUDED.restrictions,
      issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date,
      hazmat_linked_to_license = EXCLUDED.hazmat_linked_to_license,
      hazmat_issue_date = EXCLUDED.hazmat_issue_date,
      hazmat_expiration_date = EXCLUDED.hazmat_expiration_date,
      updated_at = now();
  END IF;

  IF p_data ? 'hazmat_linked_to_license' THEN
    UPDATE driver_licenses
    SET hazmat_linked_to_license = (p_data->>'hazmat_linked_to_license')::boolean
    WHERE user_id = p_user_id AND company_id = p_company_id;
  END IF;

  v_med := p_data->'medical';
  IF v_med IS NOT NULL AND v_med != 'null'::jsonb THEN
    INSERT INTO driver_medical_cards (user_id, company_id, issue_date, expiration_date, examiner_name, attached_to_license, updated_at)
    VALUES (p_user_id, p_company_id,
      NULLIF(v_med->>'issue_date','')::date,
      NULLIF(v_med->>'expiration_date','')::date,
      v_med->>'examiner_name',
      COALESCE((v_med->>'attached_to_license')::boolean, false),
      now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date,
      examiner_name = EXCLUDED.examiner_name,
      attached_to_license = EXCLUDED.attached_to_license,
      updated_at = now();
  END IF;

  v_twic := p_data->'twic';
  IF v_twic IS NOT NULL AND v_twic != 'null'::jsonb THEN
    INSERT INTO driver_twic_cards (user_id, company_id, card_number, issue_date, expiration_date, updated_at)
    VALUES (p_user_id, p_company_id, v_twic->>'card_number',
      NULLIF(v_twic->>'issue_date','')::date, NULLIF(v_twic->>'expiration_date','')::date, now())
    ON CONFLICT (user_id, company_id) DO UPDATE SET
      card_number = EXCLUDED.card_number, issue_date = EXCLUDED.issue_date,
      expiration_date = EXCLUDED.expiration_date, updated_at = now();
  END IF;

  IF p_data ? 'port_ids' THEN
    DELETE FROM driver_port_ids WHERE user_id = p_user_id AND company_id = p_company_id;
    FOR v_port IN SELECT * FROM jsonb_array_elements(p_data->'port_ids') LOOP
      INSERT INTO driver_port_ids (user_id, company_id, port_name, expiration_date)
      VALUES (p_user_id, p_company_id, v_port->>'port_name', NULLIF(v_port->>'expiration_date','')::date);
    END LOOP;
  END IF;
END;
$function$;
