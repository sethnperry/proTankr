-- Phase 2 of solo onboarding: super-admin invite + entitlement.
--
-- Depends on 20260814000000_company_subscriptions.sql being applied FIRST
-- (that migration creates company_subscriptions; apply it before this one).
--
-- Access is invite-only via the super admin for now (no payment processor
-- wired). The super admin invites a solo driver; this provisions THEIR OWN
-- solo company and records an entitlement row. "Free/comped" grants
-- non-expiring access (status 'active', comped = true); "Paid" is flagged for
-- future billing conversion (status 'trialing', comped = false). Neither is
-- hard-gated on access in this pass -- both reach the app; the flag only
-- records intent for when Stripe/RevenueCat exists.

-- comped distinguishes a free/operator-granted "active" from a real paid one.
alter table public.company_subscriptions
  add column if not exists comped boolean not null default false;

-- admin_invite_solo_user: super-admin-only. Provisions the invitee's solo
-- company (idempotent -- reuses any existing membership, same logic as
-- provision_solo_company but for a target user_id) and upserts their
-- entitlement row. SECURITY DEFINER so it can write companies/user_companies/
-- company_subscriptions (none of which allow direct client writes); the
-- is_super_admin() gate is what authorizes the caller. Returns the company_id.
create or replace function public.admin_invite_solo_user(p_user_id uuid, p_comped boolean)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_id uuid;
  v_company_id  uuid;
  v_name_seed   text;
begin
  if not public.is_super_admin() then
    raise exception 'Access denied';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Idempotent: reuse the target's oldest existing membership if any.
  select company_id into v_existing_id
  from public.user_companies
  where user_id = p_user_id
  order by created_at
  limit 1;

  if v_existing_id is not null then
    v_company_id := v_existing_id;
  else
    select coalesce(p.display_name, split_part(au.email, '@', 1))
      into v_name_seed
    from auth.users au
    left join public.profiles p on p.user_id = au.id
    where au.id = p_user_id;

    insert into public.companies (company_name, is_solo, owner_user_id)
    values (coalesce(v_name_seed, 'Driver') || '''s Equipment', true, p_user_id)
    returning company_id into v_company_id;

    insert into public.user_companies (user_id, company_id, role, created_at)
    values (p_user_id, v_company_id, 'admin', now());

    insert into public.user_settings (user_id, active_company_id, updated_at)
    values (p_user_id, v_company_id, now())
    on conflict (user_id) do update
      set active_company_id = coalesce(public.user_settings.active_company_id, excluded.active_company_id),
          updated_at = now();
  end if;

  -- Entitlement: comped -> non-expiring active; paid -> trialing (future
  -- billing). Solo tier, single admin seat, no other seats.
  insert into public.company_subscriptions (company_id, tier, status, paid_admin_seats, paid_other_seats, comped)
  values (v_company_id, 'solo', case when p_comped then 'active' else 'trialing' end, 1, 0, p_comped)
  on conflict (company_id) do update
    set tier = 'solo',
        status = case when p_comped then 'active' else 'trialing' end,
        comped = p_comped,
        updated_at = now();

  return v_company_id;
end;
$function$;

revoke all on function public.admin_invite_solo_user(uuid, boolean) from public, anon;
grant execute on function public.admin_invite_solo_user(uuid, boolean) to authenticated;
