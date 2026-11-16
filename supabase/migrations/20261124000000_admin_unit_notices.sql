-- When staff change a unit another driver is using: log it, drop a message in the unit's Squawk channel, and show the
-- driver a banner until they acknowledge it. The notice is sent by admin_notice_unit() so a non-holder can post to a
-- unit channel; drivers read their own notices and acknowledge them through ack_unit_notice().

create table if not exists public.equipment_admin_actions (
  action_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  unit_kind text not null check (unit_kind in ('truck','trailer')),
  unit_id uuid not null,
  unit_name text,
  actor_id uuid not null,
  actor_name text,
  action text not null,
  summary text not null,
  holder_id uuid,
  squawk_id uuid,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists equipment_admin_actions_holder on public.equipment_admin_actions (holder_id, acknowledged_at);
create index if not exists equipment_admin_actions_unit on public.equipment_admin_actions (unit_kind, unit_id, created_at desc);
alter table public.equipment_admin_actions enable row level security;
drop policy if exists eaa_read on public.equipment_admin_actions;
create policy eaa_read on public.equipment_admin_actions for select to authenticated using (public.is_company_staff(company_id) or holder_id = auth.uid());

-- Who is holding a unit right now (their selected equipment), if anyone.
create or replace function public.unit_holder(p_kind text, p_unit_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.user_id from public.user_settings s
   where (p_kind = 'truck' and s.current_truck_id = p_unit_id) or (p_kind = 'trailer' and s.current_trailer_id = p_unit_id)
   limit 1
$$;

-- What the staff member needs before changing a unit: who holds it and whether they are on an open trip.
create or replace function public.unit_holder_info(p_kind text, p_unit_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_co uuid; v_holder uuid; v_name text; v_trip boolean := false;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_kind = 'truck' then select company_id into v_co from public.trucks where truck_id = p_unit_id;
  else select company_id into v_co from public.trailers where trailer_id = p_unit_id; end if;
  if v_co is null or not public.is_company_staff(v_co) then raise exception 'Not authorized'; end if;
  v_holder := public.unit_holder(p_kind, p_unit_id);
  if v_holder is null or v_holder = auth.uid() then return jsonb_build_object('holder_id', null, 'holder_name', null, 'open_trip', false); end if;
  select display_name into v_name from public.profiles where user_id = v_holder;
  select exists (select 1 from public.trips t where t.driver_id = v_holder and t.status in ('draft','loading','in_transit','delivering')
                   and ((p_kind = 'truck' and t.truck_id = p_unit_id) or (p_kind = 'trailer' and t.trailer_id = p_unit_id))) into v_trip;
  return jsonb_build_object('holder_id', v_holder, 'holder_name', v_name, 'open_trip', v_trip);
end $$;

create or replace function public.admin_notice_unit(p_kind text, p_unit_id uuid, p_action text, p_summary text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_co uuid; v_unit text; v_holder uuid; v_actor text; v_sq uuid; v_body text; v_aid uuid; v_ini text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('truck','trailer') then raise exception 'Invalid unit kind'; end if;
  if p_kind = 'truck' then select company_id, truck_name into v_co, v_unit from public.trucks where truck_id = p_unit_id;
  else select company_id, trailer_name into v_co, v_unit from public.trailers where trailer_id = p_unit_id; end if;
  if v_co is null or not public.is_company_staff(v_co) then raise exception 'Not authorized'; end if;
  select display_name into v_actor from public.profiles where user_id = auth.uid();
  v_holder := public.unit_holder(p_kind, p_unit_id);
  if v_holder = auth.uid() then v_holder := null; end if;
  if v_holder is not null then
    v_body := 'Admin changed ' || initcap(p_kind) || ' ' || coalesce(v_unit, '') || ': ' || left(coalesce(p_summary, ''), 400);
    v_ini := public._driver_initials(auth.uid());
    insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, sender_initials, sender_truck, sender_company, body, attachments, expires_at)
    values (p_kind, p_unit_id::text, v_co, auth.uid(), v_ini || ' - Admin', v_ini, 'Admin', 'Admin', v_body, '[]'::jsonb, 'infinity'::timestamptz) returning id into v_sq;
  end if;
  insert into public.equipment_admin_actions (company_id, unit_kind, unit_id, unit_name, actor_id, actor_name, action, summary, holder_id, squawk_id)
  values (v_co, p_kind, p_unit_id, v_unit, auth.uid(), v_actor, left(coalesce(p_action, 'update'), 40), left(coalesce(p_summary, ''), 400), v_holder, v_sq) returning action_id into v_aid;
  return jsonb_build_object('action_id', v_aid, 'notified', v_holder is not null);
end $$;

create or replace function public.ack_unit_notice(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.equipment_admin_actions set acknowledged_at = now() where action_id = p_id and holder_id = auth.uid() and acknowledged_at is null
$$;

grant execute on function public.unit_holder_info(text, uuid), public.admin_notice_unit(text, uuid, text, text), public.ack_unit_notice(uuid) to authenticated;
revoke all on function public.unit_holder(text, uuid) from public, anon, authenticated;

-- A status change by someone else (staff) never releases the holder's claim: the driver keeps the equipment until
-- their own end of shift. Only the holder's own parking lets go of the unit.
create or replace function public.set_equipment_status(p_unit_kind text, p_unit_id uuid, p_status text, p_region text default null::text, p_local_area text default null::text, p_notes text default null::text, p_sub_status text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_active_company uuid;
  v_company_id     uuid;
  v_rec            record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_unit_kind not in ('truck', 'trailer') then raise exception 'Invalid unit kind: %', p_unit_kind; end if;
  if p_status not in ('in_use', 'deadline', 'readyline') then raise exception 'Invalid status: %', p_status; end if;
  v_active_company := get_active_company_id();
  if v_active_company is null then raise exception 'No active company set. Please select a company first.'; end if;
  if p_unit_kind = 'truck' then select company_id into v_company_id from public.trucks where truck_id = p_unit_id;
  else select company_id into v_company_id from public.trailers where trailer_id = p_unit_id; end if;
  if v_company_id is null or v_company_id <> v_active_company then raise exception 'Not authorized'; end if;

  if p_status in ('deadline', 'readyline') then
    -- Let go of the unit, but only the caller's own hold; keep the pairing.
    for v_rec in
      select combo_id, claimed_by from public.equipment_combos
       where active = true and claimed_by is not null and claimed_by = auth.uid()
         and ((p_unit_kind = 'truck' and truck_id = p_unit_id) or (p_unit_kind = 'trailer' and trailer_id = p_unit_id))
    loop
      update public.equipment_combos set claimed_by = null, claimed_at = null where combo_id = v_rec.combo_id;
      update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = v_rec.claimed_by;
    end loop;
  end if;

  if p_unit_kind = 'truck' then
    update public.trucks set status_code = p_status, status_notes = p_notes, status_updated_at = now(),
      current_region = coalesce(p_region, current_region), current_local_area = coalesce(p_local_area, current_local_area), sub_status = p_sub_status
     where truck_id = p_unit_id;
  else
    update public.trailers set status_code = p_status, status_notes = p_notes, status_updated_at = now(),
      current_region = coalesce(p_region, current_region), current_local_area = coalesce(p_local_area, current_local_area), sub_status = p_sub_status
     where trailer_id = p_unit_id;
  end if;
end;
$function$;
