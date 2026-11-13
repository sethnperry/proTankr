-- Automatic end of shift (server side): parks a truck (and its trailer) where the tracker says it stopped.
-- Same effects as the driver's own End shift: let go of the claim, status Readyline / Parked unless it was set
-- during the shift, and a location pin. Service role only: it has no signed-in user to check.
create or replace function public.auto_park_equipment(
  p_user_id uuid, p_truck_id uuid, p_trailer_id uuid, p_lat double precision, p_lon double precision,
  p_label text, p_place_id uuid, p_set_status boolean, p_notes text
) returns void language plpgsql security definer set search_path = public as $$
declare v_rec record; v_company uuid;
begin
  if p_truck_id is not null then
    select company_id into v_company from public.trucks where truck_id = p_truck_id;
  elsif p_trailer_id is not null then
    select company_id into v_company from public.trailers where trailer_id = p_trailer_id;
  end if;
  if v_company is null then return; end if;
  -- Let go of the unit; keep the pairing.
  for v_rec in
    select combo_id, claimed_by from public.equipment_combos
     where active = true and claimed_by is not null
       and ((p_truck_id is not null and truck_id = p_truck_id) or (p_trailer_id is not null and trailer_id = p_trailer_id))
  loop
    update public.equipment_combos set claimed_by = null, claimed_at = null where combo_id = v_rec.combo_id;
    update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = v_rec.claimed_by;
  end loop;
  update public.user_settings set current_truck_id = null, current_trailer_id = null, updated_at = now() where user_id = p_user_id;
  if p_truck_id is not null and p_set_status then
    update public.trucks set status_code = 'readyline', status_notes = p_notes, status_updated_at = now(), sub_status = 'Parked' where truck_id = p_truck_id;
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
revoke all on function public.auto_park_equipment(uuid, uuid, uuid, double precision, double precision, text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.auto_park_equipment(uuid, uuid, uuid, double precision, double precision, text, uuid, boolean, text) to service_role;
