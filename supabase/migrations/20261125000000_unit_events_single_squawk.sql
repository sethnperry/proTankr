-- Admin/dispatch changes to a unit always leave a Squawk on the unit: the driver using it sees it now, and the next
-- driver who selects the equipment sees it when they do. A coupled pair gets ONE message (on the truck's channel,
-- naming both units). Service, wash and scale records made by an admin or dispatcher do this on their own.

alter table public.equipment_admin_actions add column if not exists channel_key text;

create or replace function public._is_admin_actor(p_company uuid, p_actor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins s where s.user_id = p_actor)
      or exists (select 1 from public.user_companies uc where uc.user_id = p_actor and uc.company_id = p_company and coalesce(uc.role, '') in ('owner','admin','dispatch'))
$$;
revoke all on function public._is_admin_actor(uuid, uuid) from public, anon, authenticated;

create or replace function public._unit_event(p_actor uuid, p_kind text, p_unit_id uuid, p_action text, p_summary text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_co uuid; v_unit text; v_combo record; v_truck_name text; v_trailer_name text;
  v_ch_kind text; v_ch_key text; v_label text; v_holder uuid; v_actor_name text; v_ini text;
  v_prev record; v_sq uuid; v_aid uuid; v_body text;
begin
  if p_kind = 'truck' then select company_id, truck_name into v_co, v_unit from public.trucks where truck_id = p_unit_id;
  else select company_id, trailer_name into v_co, v_unit from public.trailers where trailer_id = p_unit_id; end if;
  if v_co is null or not public._is_admin_actor(v_co, p_actor) then return jsonb_build_object('skipped', true); end if;

  select c.combo_id, c.truck_id, c.trailer_id into v_combo from public.equipment_combos c
   where c.active = true and ((p_kind = 'truck' and c.truck_id = p_unit_id) or (p_kind = 'trailer' and c.trailer_id = p_unit_id)) limit 1;
  if v_combo.combo_id is not null then
    -- Coupled: one message for the pair, on the truck's channel.
    select truck_name into v_truck_name from public.trucks where truck_id = v_combo.truck_id;
    select trailer_name into v_trailer_name from public.trailers where trailer_id = v_combo.trailer_id;
    v_ch_kind := 'truck'; v_ch_key := v_combo.truck_id::text;
    v_label := 'Truck ' || coalesce(v_truck_name, '') || ' / Trailer ' || coalesce(v_trailer_name, '');
    v_holder := coalesce(public.unit_holder('truck', v_combo.truck_id), public.unit_holder('trailer', v_combo.trailer_id));
  else
    v_ch_kind := p_kind; v_ch_key := p_unit_id::text;
    v_label := initcap(p_kind) || ' ' || coalesce(v_unit, '');
    v_holder := public.unit_holder(p_kind, p_unit_id);
  end if;
  -- An admin working on equipment they are using themselves is not a change someone needs to hear about.
  if v_holder = p_actor then return jsonb_build_object('skipped', true); end if;
  select display_name into v_actor_name from public.profiles where user_id = p_actor;

  -- The same change on both units of a pair (two calls) is still one message.
  select a.action_id, a.squawk_id into v_prev from public.equipment_admin_actions a
   where a.actor_id = p_actor and a.action = left(coalesce(p_action, 'update'), 40) and a.company_id = v_co and a.channel_key = v_ch_key
     and a.created_at > now() - interval '30 seconds' order by a.created_at desc limit 1;
  if v_prev.action_id is not null then
    insert into public.equipment_admin_actions (company_id, unit_kind, unit_id, unit_name, actor_id, actor_name, action, summary, holder_id, squawk_id, channel_key)
    values (v_co, p_kind, p_unit_id, v_unit, p_actor, v_actor_name, left(coalesce(p_action, 'update'), 40), left(coalesce(p_summary, ''), 400), null, v_prev.squawk_id, v_ch_key);
    return jsonb_build_object('deduped', true);
  end if;

  v_ini := public._driver_initials(p_actor);
  v_body := 'Admin changed ' || v_label || ': ' || left(coalesce(p_summary, ''), 400);
  insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, sender_initials, sender_truck, sender_company, body, attachments, expires_at)
  values (v_ch_kind, v_ch_key, v_co, p_actor, v_ini || ' - Admin', v_ini, 'Admin', 'Admin', v_body, '[]'::jsonb, 'infinity'::timestamptz) returning id into v_sq;
  insert into public.equipment_admin_actions (company_id, unit_kind, unit_id, unit_name, actor_id, actor_name, action, summary, holder_id, squawk_id, channel_key)
  values (v_co, p_kind, p_unit_id, v_unit, p_actor, v_actor_name, left(coalesce(p_action, 'update'), 40), left(coalesce(p_summary, ''), 400), v_holder, v_sq, v_ch_key) returning action_id into v_aid;
  return jsonb_build_object('action_id', v_aid, 'notified', v_holder is not null, 'squawk', true);
end $$;
revoke all on function public._unit_event(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public._unit_event(uuid, text, uuid, text, text) to service_role;

create or replace function public.admin_notice_unit(p_kind text, p_unit_id uuid, p_action text, p_summary text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('truck','trailer') then raise exception 'Invalid unit kind'; end if;
  return public._unit_event(auth.uid(), p_kind, p_unit_id, p_action, p_summary);
end $$;
grant execute on function public.admin_notice_unit(text, uuid, text, text) to authenticated;

-- Service, wash and scale records made by an admin or dispatcher tell the unit's next (or current) driver.
create or replace function public._record_unit_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text; v_id uuid; v_what text := case tg_table_name when 'service_records' then 'service' when 'wash_records' then 'wash' else 'scale' end;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'weight_records' then
    select 'truck', c.truck_id into v_kind, v_id from public.equipment_combos c where c.combo_id = new.combo_id;
  elsif new.truck_id is not null then v_kind := 'truck'; v_id := new.truck_id;
  elsif new.trailer_id is not null then v_kind := 'trailer'; v_id := new.trailer_id; end if;
  if v_id is not null then
    perform public._unit_event(auth.uid(), v_kind, v_id, v_what, case v_what when 'service' then 'service logged' when 'wash' then 'wash logged' else 'scale ticket logged (tare and target may have changed)' end);
  end if;
  return new;
exception when others then
  return new; -- the record itself must never fail because of the notice
end $$;
drop trigger if exists zz_unit_event on public.service_records;
create trigger zz_unit_event after insert on public.service_records for each row execute function public._record_unit_event();
drop trigger if exists zz_unit_event on public.wash_records;
create trigger zz_unit_event after insert on public.wash_records for each row execute function public._record_unit_event();
drop trigger if exists zz_unit_event on public.weight_records;
create trigger zz_unit_event after insert on public.weight_records for each row execute function public._record_unit_event();
