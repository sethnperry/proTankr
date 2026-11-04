-- Where parked equipment is. One pin per unit (a truck or a trailer): written when a driver ends a shift and parks,
-- and removed the moment anyone takes the unit (a claim, a coupling, or a bobtail/trailer-only hold), so a pin never
-- shows for a unit that is in use. Pins don't expire: spare equipment that sits is still where it was left.
-- Live positions (a tracker) are a separate, later thing.
create table if not exists public.equipment_parks (
  unit_kind text not null check (unit_kind in ('truck', 'trailer')),
  unit_id uuid not null,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  place_label text,
  place_id uuid,
  parked_by uuid references auth.users(id) on delete set null,
  parked_at timestamptz not null default now(),
  primary key (unit_kind, unit_id)
);
create index if not exists equipment_parks_company_idx on public.equipment_parks (company_id);
alter table public.equipment_parks enable row level security;
drop policy if exists equipment_parks_read on public.equipment_parks;
create policy equipment_parks_read on public.equipment_parks for select using (public.is_company_member(company_id));
-- No write policies: pins are written by park_equipment and cleared by the triggers below.

create or replace function public.park_equipment(
  p_truck_id uuid, p_trailer_id uuid, p_lat double precision, p_lon double precision,
  p_label text default null, p_place_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_truck_co uuid; v_trailer_co uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  v_company := get_active_company_id();
  if v_company is null then raise exception 'No active company set.'; end if;
  if p_truck_id is not null then
    select company_id into v_truck_co from public.trucks where truck_id = p_truck_id;
    if v_truck_co is null or v_truck_co <> v_company then raise exception 'Not authorized'; end if;
    insert into public.equipment_parks (unit_kind, unit_id, company_id, lat, lon, place_label, place_id, parked_by, parked_at)
    values ('truck', p_truck_id, v_company, p_lat, p_lon, nullif(trim(p_label), ''), p_place_id, auth.uid(), now())
    on conflict (unit_kind, unit_id) do update
      set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon, place_label = excluded.place_label,
          place_id = excluded.place_id, parked_by = excluded.parked_by, parked_at = excluded.parked_at;
  end if;
  if p_trailer_id is not null then
    select company_id into v_trailer_co from public.trailers where trailer_id = p_trailer_id;
    if v_trailer_co is null or v_trailer_co <> v_company then raise exception 'Not authorized'; end if;
    insert into public.equipment_parks (unit_kind, unit_id, company_id, lat, lon, place_label, place_id, parked_by, parked_at)
    values ('trailer', p_trailer_id, v_company, p_lat, p_lon, nullif(trim(p_label), ''), p_place_id, auth.uid(), now())
    on conflict (unit_kind, unit_id) do update
      set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon, place_label = excluded.place_label,
          place_id = excluded.place_id, parked_by = excluded.parked_by, parked_at = excluded.parked_at;
  end if;
end $$;
revoke all on function public.park_equipment(uuid, uuid, double precision, double precision, text, uuid) from public;
grant execute on function public.park_equipment(uuid, uuid, double precision, double precision, text, uuid) to authenticated;

-- A claimed pairing means its units are in use: their pins go.
create or replace function public.clear_parks_on_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.claimed_by is not null then
    delete from public.equipment_parks
     where (unit_kind = 'truck' and unit_id = new.truck_id) or (unit_kind = 'trailer' and unit_id = new.trailer_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_clear_parks_on_claim on public.equipment_combos;
create trigger trg_clear_parks_on_claim after insert or update of claimed_by on public.equipment_combos
  for each row when (new.claimed_by is not null) execute function public.clear_parks_on_claim();

-- Held without a pairing (bobtail, trailer-only): same.
create or replace function public.clear_parks_on_hold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.current_truck_id is not null then
    delete from public.equipment_parks where unit_kind = 'truck' and unit_id = new.current_truck_id;
  end if;
  if new.current_trailer_id is not null then
    delete from public.equipment_parks where unit_kind = 'trailer' and unit_id = new.current_trailer_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_clear_parks_on_hold on public.user_settings;
create trigger trg_clear_parks_on_hold after insert or update of current_truck_id, current_trailer_id on public.user_settings
  for each row execute function public.clear_parks_on_hold();
