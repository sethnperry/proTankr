-- One store, one location: the same name + store number in the same state can't be saved twice.
-- First merge the duplicates already there (keep the one with tanks, else the oldest), moving the
-- trips and stars onto it; then add the unique index.
-- Applied 2026-10-29 (it merged the two #708 Loves in Bushnell).

create or replace function public._loc_norm_name(n text) returns text language sql immutable as
$$ select regexp_replace(lower(coalesce(n,'')), '[^a-z0-9]', '', 'g') $$;
create or replace function public._loc_norm_ref(n text) returns text language sql immutable as
$$ select upper(regexp_replace(coalesce(n,''), '[^a-zA-Z0-9]', '', 'g')) $$;

do $$
declare g record; keeper uuid; dup uuid;
begin
  for g in
    select company_id, public._loc_norm_name(name) nn, public._loc_norm_ref(location_number) nr, upper(coalesce(state,'')) st
      from public.delivery_locations
     where is_active and public._loc_norm_ref(location_number) <> ''
     group by 1,2,3,4 having count(*) > 1
  loop
    select l.location_id into keeper from public.delivery_locations l
     where l.company_id = g.company_id and l.is_active
       and public._loc_norm_name(l.name) = g.nn and public._loc_norm_ref(l.location_number) = g.nr and upper(coalesce(l.state,'')) = g.st
     order by (select count(*) from public.delivery_location_tanks t where t.location_id = l.location_id) desc, l.created_at asc
     limit 1;
    for dup in
      select l.location_id from public.delivery_locations l
       where l.company_id = g.company_id and l.is_active and l.location_id <> keeper
         and public._loc_norm_name(l.name) = g.nn and public._loc_norm_ref(l.location_number) = g.nr and upper(coalesce(l.state,'')) = g.st
    loop
      update public.trip_deliveries set location_id = keeper where location_id = dup;
      delete from public.delivery_location_stars s where s.location_id = dup
         and exists (select 1 from public.delivery_location_stars k where k.location_id = keeper and k.user_id = s.user_id);
      update public.delivery_location_stars set location_id = keeper where location_id = dup;
      if not exists (select 1 from public.delivery_location_tanks where location_id = keeper) then
        update public.delivery_location_tanks set location_id = keeper where location_id = dup;
      end if;
      update public.delivery_locations set is_active = false, updated_at = now() where location_id = dup;
    end loop;
  end loop;
end $$;

create unique index if not exists delivery_locations_one_store
  on public.delivery_locations (company_id, public._loc_norm_name(name), public._loc_norm_ref(location_number), upper(coalesce(state,'')))
  where is_active and public._loc_norm_ref(location_number) <> '';
