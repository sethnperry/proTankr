-- No trailer is ever in use without power. Two ways a driver could be left holding a trailer with no truck:
--  1. Someone takes over their truck (set_current_equipment / couple_combo p_force -> _evict_combo_to_partial). The old rule kept
--     "the unit nobody claimed", so the driver kept the trailer and lost the truck. Now a trailer is only kept alongside a truck:
--     lose the truck and the trailer is released too (it shows as Readyline · Parked, free), while losing the trailer still leaves
--     the driver a bobtail.
--  2. set_current_equipment(null, trailer). It now holds nothing instead of a trailer-only hold (the app keeps a trailer it is
--     finding a new truck for in its own memory, not in this table).

create or replace function public._evict_combo_to_partial(p_combo_id uuid, p_claiming_truck uuid, p_claiming_trailer uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_owner        uuid;
  v_truck        uuid;
  v_trailer      uuid;
  v_kept_truck   uuid;
  v_kept_trailer uuid;
  v_released     uuid;
begin
  select claimed_by, truck_id, trailer_id into v_owner, v_truck, v_trailer from public.equipment_combos where combo_id = p_combo_id;
  if not found then return; end if;

  v_kept_truck   := case when v_truck   = p_claiming_truck   then null else v_truck   end;
  v_kept_trailer := case when v_trailer = p_claiming_trailer then null else v_trailer end;

  -- A trailer is never kept without a truck: release it too.
  if v_kept_truck is null and v_kept_trailer is not null then
    v_released := v_kept_trailer;
    v_kept_trailer := null;
  end if;

  update public.equipment_combos set active = false, claimed_by = null, claimed_at = null where combo_id = p_combo_id;

  if v_owner is not null then
    update public.user_settings set current_truck_id = v_kept_truck, current_trailer_id = v_kept_trailer, updated_at = now() where user_id = v_owner;
  end if;

  if v_released is not null then
    update public.trailers
       set status_code = 'readyline', sub_status = 'Parked', status_notes = 'Released: its truck was taken over', status_updated_at = now()
     where trailer_id = v_released and status_code = 'in_use';
  end if;
end;
$function$;

create or replace function public.set_current_equipment(p_truck_id uuid, p_trailer_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_company_id uuid;
  v_truck_co   uuid;
  v_trailer_co uuid;
  v_rec        record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_truck_id is not null and p_trailer_id is not null then raise exception 'Use couple_combo for a full pair'; end if;
  -- A trailer alone is never held: it needs a truck. Holding nothing is the safe reading of "trailer only".
  if p_truck_id is null and p_trailer_id is not null then p_trailer_id := null; end if;

  v_company_id := get_active_company_id();
  if v_company_id is null then raise exception 'No active company set. Please select a company first.'; end if;

  if p_truck_id is not null then
    select company_id into v_truck_co from public.trucks where truck_id = p_truck_id;
    if v_truck_co is null or v_truck_co <> v_company_id then raise exception 'Not authorized'; end if;
  end if;

  for v_rec in
    select combo_id from public.equipment_combos
     where active = true and claimed_by is not null and claimed_by <> auth.uid()
       and ((p_truck_id is not null and truck_id = p_truck_id) or (p_trailer_id is not null and trailer_id = p_trailer_id))
  loop
    perform public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
  end loop;

  update public.equipment_combos set active = false, claimed_by = null, claimed_at = null where claimed_by = auth.uid() and active = true;

  update public.user_settings set current_truck_id = p_truck_id, current_trailer_id = p_trailer_id, updated_at = now() where user_id = auth.uid();
end;
$function$;

create or replace function public.set_current_equipment(p_truck_id uuid, p_trailer_id uuid, p_user_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_company_id uuid;
  v_truck_co   uuid;
  v_trailer_co uuid;
  v_rec        record;
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' then raise exception 'Forbidden'; end if;
  if p_truck_id is not null and p_trailer_id is not null then raise exception 'Use couple_combo for a full pair'; end if;
  if p_truck_id is null and p_trailer_id is not null then p_trailer_id := null; end if;

  select coalesce(
    (select active_company_id from public.user_settings where user_id = p_user_id and active_company_id is not null),
    (select company_id from public.user_companies where user_id = p_user_id order by created_at limit 1)
  ) into v_company_id;
  if v_company_id is null then raise exception 'No active company set. Please select a company first.'; end if;

  if p_truck_id is not null then
    select company_id into v_truck_co from public.trucks where truck_id = p_truck_id;
    if v_truck_co is null or v_truck_co <> v_company_id then raise exception 'Not authorized'; end if;
  end if;

  for v_rec in
    select combo_id from public.equipment_combos
     where active = true and claimed_by is not null and claimed_by <> p_user_id
       and ((p_truck_id is not null and truck_id = p_truck_id) or (p_trailer_id is not null and trailer_id = p_trailer_id))
  loop
    perform public._evict_combo_to_partial(v_rec.combo_id, p_truck_id, p_trailer_id);
  end loop;

  update public.equipment_combos set active = false, claimed_by = null, claimed_at = null where claimed_by = p_user_id and active = true;

  update public.user_settings set current_truck_id = p_truck_id, current_trailer_id = p_trailer_id, updated_at = now() where user_id = p_user_id;
end;
$function$;
