-- Setup progress for every driver and lead in a company, for the Company Dashboard roster. Staff only.
-- Returns yes/no and counts, never the private values themselves (no PINs, no Vault, no plan contents): the
-- admin sees that a driver has a fuel PIN, not what it is. Same facts the driver's own checklist uses
-- (lib/setup/loadSetup.ts), so the two counters agree.
create or replace function public.company_setup_status(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if auth.uid() is null or not public.is_company_staff(p_company_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'is_solo', (select c.is_solo from companies c where c.company_id = p_company_id),
    'regions_defined', exists(select 1 from equipment_regions r where r.company_id = p_company_id and r.is_active)
                    or exists(select 1 from equipment_local_areas a where a.company_id = p_company_id and a.is_active),
    'fuel_program', exists(select 1 from fuel_payment_methods m where m.company_id = p_company_id and m.is_active and m.kind in ('rfid','company_account')),
    'telematics', exists(select 1 from telematics_connections t where t.company_id = p_company_id and t.status = 'active'),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', uc.user_id,
        'role', uc.role,
        'display_name', pr.display_name,
        'employee_number', pr.employee_number,
        'region', pr.region,
        'local_area', pr.local_area,
        'license_number', (select l.license_number from driver_licenses l where l.user_id = uc.user_id order by l.updated_at desc nulls last limit 1),
        'license_expiry', (select l.expiration_date from driver_licenses l where l.user_id = uc.user_id order by l.updated_at desc nulls last limit 1),
        'medical_expiry', (select d.expiration_date from driver_medical_cards d where d.user_id = uc.user_id order by d.updated_at desc nulls last limit 1),
        'schedule_days', coalesce((select cardinality(s.days_of_week) from driver_schedules s where s.user_id = uc.user_id and s.company_id = p_company_id), 0),
        'has_truck', exists(select 1 from user_settings us where us.user_id = uc.user_id and us.current_truck_id is not null)
                  or exists(select 1 from equipment_combos ec where ec.claimed_by = uc.user_id and ec.active),
        'has_trailer', exists(select 1 from user_settings us where us.user_id = uc.user_id and us.current_trailer_id is not null)
                    or exists(select 1 from equipment_combos ec where ec.claimed_by = uc.user_id and ec.active),
        'plans_saved', (select count(distinct ps.slot) from user_plan_slots ps
                         where ps.user_id = uc.user_id and ps.slot between 1 and 5
                           and jsonb_typeof(ps.payload::jsonb -> 'compPlan') = 'object'
                           and exists(select 1 from jsonb_each(ps.payload::jsonb -> 'compPlan') e
                                       where coalesce(e.value ->> 'productId', '') <> ''
                                         and coalesce((e.value ->> 'empty')::boolean, false) = false)),
        'terminals_starred', (select count(*) from my_terminals mt where mt.user_id = uc.user_id and mt.is_starred),
        'locations_starred', (select count(*) from delivery_location_stars st where st.user_id = uc.user_id),
        'has_fuel_pin', exists(select 1 from driver_fuel_pins fp where fp.user_id = uc.user_id),
        'push_on', exists(select 1 from push_subscriptions p where p.user_id = uc.user_id),
        'hours_linked', exists(select 1 from telematics_driver_credentials tc where tc.user_id = uc.user_id and tc.company_id = p_company_id and tc.status = 'active'),
        'per_diem_home', exists(select 1 from per_diem_homes h where h.user_id = uc.user_id and h.city is not null),
        'vault_set', exists(select 1 from user_vault_pin vp where vp.user_id = uc.user_id),
        'confirmations', coalesce((select jsonb_object_agg(dc.step, dc.confirmed_at) from driver_setup_confirmations dc where dc.user_id = uc.user_id), '{}'::jsonb)
      ) order by pr.display_name nulls last)
      from user_companies uc
      left join profiles pr on pr.user_id = uc.user_id
      where uc.company_id = p_company_id and uc.role in ('driver', 'lead')
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.company_setup_status(uuid) from public;
grant execute on function public.company_setup_status(uuid) to authenticated;
