-- Company Settings (regular fleet/solo admin, not super-admin) --
-- companies has SELECT-only RLS and no write policies at all (see
-- 20260719000000_super_admin_company_management.sql's own header comment).
-- The only existing writer of company_name is either super_admin_update_company
-- (super-admin only, app/superadmin/page.tsx) or set_solo_company_name
-- (owner-gated, solo-only, app/planner/components/SoloOnboarding.tsx) -- a
-- regular FLEET company admin has had no way to rename their own company at
-- all. admin_update_company_name fills that gap for BOTH tiers, gated on
-- is_company_admin() (any admin of the company, not just owner_user_id,
-- which is only ever populated for solo companies per the solo-provisioning
-- design -- gating fleet rename on it would lock out every fleet admin).
-- Deliberately separate from set_solo_company_name rather than replacing
-- it -- that function is owner-gated specifically for the onboarding flow,
-- untouched here.
--
-- is_solo itself is intentionally NOT editable here -- converting a
-- company's tier has real billing/seat implications that aren't decided
-- yet (see company_subscriptions' own header comment), so that stays a
-- super-admin-only action via super_admin_update_company.

create or replace function public.admin_update_company_name(p_company_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Company name is required';
  end if;

  if not public.is_company_admin(p_company_id) then
    raise exception 'Access denied';
  end if;

  update public.companies
     set company_name = btrim(p_name)
   where company_id = p_company_id;
end;
$function$;

revoke all on function public.admin_update_company_name(uuid, text) from public, anon;
grant execute on function public.admin_update_company_name(uuid, text) to authenticated;
