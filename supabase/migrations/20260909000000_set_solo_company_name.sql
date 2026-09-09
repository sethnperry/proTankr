-- Solo first-run onboarding: let a solo driver name their own company.
--
-- provision_solo_company() creates a solo company with an auto-generated hidden
-- name, and nothing in the app has ever written companies.company_name since --
-- confirmed by a repo-wide search. The onboarding flow asks for an OPTIONAL
-- business/company name; this is the only writer of it.
--
-- Gated exactly like the audit-pass SECURITY DEFINER functions
-- (20260907150000_secdef_target_membership_checks.sql): the caller must be the
-- OWNER of the company AND it must be a solo company. A fleet company's name is
-- managed elsewhere (super_admin_update_company); this function refuses to touch
-- one. search_path pinned. Empty/blank name is rejected so we never blank out
-- the auto name with whitespace.

CREATE OR REPLACE FUNCTION public.set_solo_company_name(p_company_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM companies
    WHERE company_id = p_company_id
      AND owner_user_id = auth.uid()
      AND coalesce(is_solo, false)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE companies
     SET company_name = btrim(p_name)
   WHERE company_id = p_company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_solo_company_name(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_solo_company_name(uuid, text) TO authenticated;
