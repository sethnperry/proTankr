-- Geotab-led equipment: repositioning a deadlined unit, and the second seat.

-- A deadlined unit being driven to the shop or yard shows "In use" while it moves; what made it Deadline waits here and
-- comes back (notes and all) when it is parked.
create table if not exists public.equipment_deadline_resume (
  unit_kind text not null check (unit_kind in ('truck','trailer')),
  unit_id uuid not null,
  company_id uuid not null,
  notes text,
  sub_status text,
  location text,
  deadlined_at timestamptz,
  deadlined_by uuid,
  deadlined_by_name text,
  repositioned_by uuid,
  repositioned_at timestamptz not null default now(),
  primary key (unit_kind, unit_id)
);
alter table public.equipment_deadline_resume enable row level security;
drop policy if exists edr_read on public.equipment_deadline_resume;
create policy edr_read on public.equipment_deadline_resume for select to authenticated using (public.is_company_member(company_id));

create or replace function public.begin_reposition(p_kind text, p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_co uuid; r record; v_by uuid; v_by_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_kind = 'truck' then
    select company_id, status_code, status_notes, sub_status, status_location, status_updated_at into r from public.trucks where truck_id = p_unit_id;
  else
    select company_id, status_code, status_notes, sub_status, status_location, status_updated_at into r from public.trailers where trailer_id = p_unit_id;
  end if;
  if r.company_id is null or not public.is_company_member(r.company_id) then raise exception 'Not authorized'; end if;
  if r.status_code <> 'deadline' then return jsonb_build_object('ok', false, 'reason', 'not_deadline'); end if;
  select parked_by into v_by from public.equipment_parks where unit_kind = p_kind and unit_id = p_unit_id;
  if v_by is not null then select display_name into v_by_name from public.profiles where user_id = v_by; end if;
  insert into public.equipment_deadline_resume (unit_kind, unit_id, company_id, notes, sub_status, location, deadlined_at, deadlined_by, deadlined_by_name, repositioned_by)
  values (p_kind, p_unit_id, r.company_id, r.status_notes, r.sub_status, r.status_location, r.status_updated_at, v_by, v_by_name, auth.uid())
  on conflict (unit_kind, unit_id) do update set notes = excluded.notes, sub_status = excluded.sub_status, location = excluded.location,
    deadlined_at = excluded.deadlined_at, deadlined_by = excluded.deadlined_by, deadlined_by_name = excluded.deadlined_by_name,
    repositioned_by = excluded.repositioned_by, repositioned_at = now();
  if p_kind = 'truck' then
    update public.trucks set status_code = 'in_use', status_notes = null, sub_status = null, status_updated_at = now() where truck_id = p_unit_id;
  else
    update public.trailers set status_code = 'in_use', status_notes = null, sub_status = null, status_updated_at = now() where trailer_id = p_unit_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- The repairs were done: the unit is no longer deadlined.
create or replace function public.resolve_deadline(p_kind text, p_unit_id uuid, p_status text default 'in_use') returns void
language plpgsql security definer set search_path = public as $$
declare v_co uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_status not in ('in_use','readyline') then raise exception 'Invalid status'; end if;
  if p_kind = 'truck' then select company_id into v_co from public.trucks where truck_id = p_unit_id; else select company_id into v_co from public.trailers where trailer_id = p_unit_id; end if;
  if v_co is null or not public.is_company_member(v_co) then raise exception 'Not authorized'; end if;
  select display_name into v_name from public.profiles where user_id = auth.uid();
  if p_kind = 'truck' then
    update public.trucks set status_code = p_status, status_notes = 'Repairs verified by ' || coalesce(v_name, 'a driver'), sub_status = null, status_updated_at = now() where truck_id = p_unit_id;
  else
    update public.trailers set status_code = p_status, status_notes = 'Repairs verified by ' || coalesce(v_name, 'a driver'), sub_status = null, status_updated_at = now() where trailer_id = p_unit_id;
  end if;
  delete from public.equipment_deadline_resume where unit_kind = p_kind and unit_id = p_unit_id;
end $$;
grant execute on function public.begin_reposition(text, uuid), public.resolve_deadline(text, uuid, text) to authenticated;

-- Parking by hand clears the resume note (the notes just entered are the new truth).
create or replace function public.set_equipment_status(p_unit_kind text, p_unit_id uuid, p_status text, p_region text default null::text, p_local_area text default null::text, p_notes text default null::text, p_sub_status text default null::text)
 returns void language plpgsql security definer set search_path to 'public'
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
    for v_rec in
      select combo_id, claimed_by from public.equipment_combos
       where active = true and claimed_by is not null and claimed_by = auth.uid()
         and ((p_unit_kind = 'truck' and truck_id = p_unit_id) or (p_unit_kind = 'trailer' and trailer_id = p_unit_id))
    loop
      update public.equipment_combos set claimed_by = null, claimed_at = null where combo_id = v_rec.combo_id;
      update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = v_rec.claimed_by;
    end loop;
    delete from public.equipment_deadline_resume where unit_kind = p_unit_kind and unit_id = p_unit_id;
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

-- Auto-close at the end of a shift: a repositioned unit goes back to Deadline with its notes, others to Readyline.
create or replace function public.auto_park_equipment(
  p_user_id uuid, p_truck_id uuid, p_trailer_id uuid, p_lat double precision, p_lon double precision,
  p_label text, p_place_id uuid, p_set_status boolean, p_notes text
) returns void language plpgsql security definer set search_path = public as $$
declare v_rec record; v_company uuid; v_res record;
begin
  if p_truck_id is not null then select company_id into v_company from public.trucks where truck_id = p_truck_id;
  elsif p_trailer_id is not null then select company_id into v_company from public.trailers where trailer_id = p_trailer_id; end if;
  if v_company is null then return; end if;
  for v_rec in
    select combo_id, claimed_by from public.equipment_combos
     where active = true and claimed_by is not null
       and ((p_truck_id is not null and truck_id = p_truck_id) or (p_trailer_id is not null and trailer_id = p_trailer_id))
  loop
    update public.equipment_combos set claimed_by = null, claimed_at = null where combo_id = v_rec.combo_id;
    update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = v_rec.claimed_by;
  end loop;
  update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = p_user_id;
  if p_truck_id is not null then
    select * into v_res from public.equipment_deadline_resume where unit_kind = 'truck' and unit_id = p_truck_id;
    if v_res.unit_id is not null then
      update public.trucks set status_code = 'deadline', status_notes = v_res.notes, sub_status = v_res.sub_status, status_updated_at = now() where truck_id = p_truck_id;
      delete from public.equipment_deadline_resume where unit_kind = 'truck' and unit_id = p_truck_id;
    elsif p_set_status then
      update public.trucks set status_code = 'readyline', status_notes = p_notes, status_updated_at = now(), sub_status = 'Parked' where truck_id = p_truck_id;
    end if;
  end if;
  if p_trailer_id is not null then
    select * into v_res from public.equipment_deadline_resume where unit_kind = 'trailer' and unit_id = p_trailer_id;
    if v_res.unit_id is not null then
      update public.trailers set status_code = 'deadline', status_notes = v_res.notes, sub_status = v_res.sub_status, status_updated_at = now() where trailer_id = p_trailer_id;
      delete from public.equipment_deadline_resume where unit_kind = 'trailer' and unit_id = p_trailer_id;
    end if;
  end if;
  if p_lat is not null and p_lon is not null then
    if p_truck_id is not null then
      insert into public.equipment_parks (unit_kind, unit_id, company_id, lat, lon, place_label, place_id, parked_by, parked_at)
      values ('truck', p_truck_id, v_company, p_lat, p_lon, nullif(trim(p_label), ''), p_place_id, p_user_id, now())
      on conflict (unit_kind, unit_id) do update set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon,
        place_label = excluded.place_label, place_id = excluded.place_id, parked_by = excluded.parked_by, parked_at = excluded.parked_at;
    end if;
    if p_trailer_id is not null then
      insert into public.equipment_parks (unit_kind, unit_id, company_id, lat, lon, place_label, place_id, parked_by, parked_at)
      values ('trailer', p_trailer_id, v_company, p_lat, p_lon, nullif(trim(p_label), ''), p_place_id, p_user_id, now())
      on conflict (unit_kind, unit_id) do update set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon,
        place_label = excluded.place_label, place_id = excluded.place_id, parked_by = excluded.parked_by, parked_at = excluded.parked_at;
    end if;
  end if;
end $$;

-- The second seat: a driver attached to a truck someone else is driving. When Geotab shows the first driver gone and
-- this one signed in, they become the driver (promote_second_seat) and take the hold.
create table if not exists public.second_seats (
  user_id uuid primary key,
  company_id uuid not null,
  truck_id uuid not null,
  joined_at timestamptz not null default now(),
  source text not null default 'app'
);
alter table public.second_seats enable row level security;
drop policy if exists ss_read on public.second_seats;
create policy ss_read on public.second_seats for select to authenticated using (public.is_company_member(company_id));

create or replace function public.join_second_seat(p_truck_id uuid, p_source text default 'app') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_co uuid; v_holder uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select company_id into v_co from public.trucks where truck_id = p_truck_id;
  if v_co is null or not public.is_company_member(v_co) then raise exception 'Not authorized'; end if;
  v_holder := public.unit_holder('truck', p_truck_id);
  if v_holder = auth.uid() then raise exception 'You are already driving that truck.'; end if;
  insert into public.second_seats (user_id, company_id, truck_id, source) values (auth.uid(), v_co, p_truck_id, coalesce(p_source, 'app'))
  on conflict (user_id) do update set truck_id = excluded.truck_id, company_id = excluded.company_id, joined_at = now(), source = excluded.source;
  if v_holder is not null then select display_name into v_name from public.profiles where user_id = v_holder; end if;
  return jsonb_build_object('driver_id', v_holder, 'driver_name', v_name);
end $$;

create or replace function public.leave_second_seat() returns void
language sql security definer set search_path = public as $$ delete from public.second_seats where user_id = auth.uid() $$;

create or replace function public.promote_second_seat(p_truck_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_combo record; v_prev uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.second_seats where user_id = auth.uid() and truck_id = p_truck_id) then raise exception 'You are not in the second seat of that truck.'; end if;
  v_prev := public.unit_holder('truck', p_truck_id);
  select combo_id, trailer_id into v_combo from public.equipment_combos where active = true and truck_id = p_truck_id limit 1;
  if v_prev is not null and v_prev <> auth.uid() then
    update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = v_prev;
  end if;
  if v_combo.combo_id is not null then
    update public.equipment_combos set claimed_by = auth.uid(), claimed_at = now() where combo_id = v_combo.combo_id;
    update public.user_settings set current_truck_id = p_truck_id, current_trailer_id = v_combo.trailer_id, updated_at = now() where user_id = auth.uid();
  else
    update public.user_settings set current_truck_id = p_truck_id, current_trailer_id = null, updated_at = now() where user_id = auth.uid();
  end if;
  delete from public.second_seats where user_id = auth.uid();
  return jsonb_build_object('combo_id', v_combo.combo_id, 'previous', v_prev);
end $$;
grant execute on function public.join_second_seat(uuid, text), public.leave_second_seat(), public.promote_second_seat(uuid) to authenticated;
