-- Where equipment is, captured when something happens (not tracked continuously). The phone writes one row when the app
-- opens or wakes, and at the driver's own events: Arrive, the odometer stamps (cancel, empty move, End shift) and so on.
-- position_captures is the append-only history (state miles for IFTA read it later). equipment_positions is the latest
-- capture per truck and trailer, kept up to date by a trigger, so Track, the dispatch dots and Find unit read one row
-- per unit. Parked pins (equipment_parks) are separate and unchanged.
create table if not exists public.position_captures (
  capture_id uuid primary key,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  truck_id uuid references public.trucks(truck_id) on delete set null,
  trailer_id uuid references public.trailers(trailer_id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  odometer numeric,
  cause text not null check (length(cause) between 1 and 40),
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (truck_id is not null or trailer_id is not null)
);
create index if not exists position_captures_truck_idx on public.position_captures (truck_id, captured_at desc) where truck_id is not null;
create index if not exists position_captures_company_idx on public.position_captures (company_id, captured_at desc);
alter table public.position_captures enable row level security;
drop policy if exists position_captures_read on public.position_captures;
create policy position_captures_read on public.position_captures for select using (public.is_company_member(company_id));
drop policy if exists position_captures_insert on public.position_captures;
create policy position_captures_insert on public.position_captures for insert
  with check (user_id = auth.uid() and company_id = public.get_active_company_id());

create table if not exists public.equipment_positions (
  unit_kind text not null check (unit_kind in ('truck', 'trailer')),
  unit_id uuid not null,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  odometer numeric,
  cause text,
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null,
  primary key (unit_kind, unit_id)
);
create index if not exists equipment_positions_company_idx on public.equipment_positions (company_id);
alter table public.equipment_positions enable row level security;
drop policy if exists equipment_positions_read on public.equipment_positions;
create policy equipment_positions_read on public.equipment_positions for select using (public.is_company_member(company_id));
-- No write policies: rows are written by the trigger below.

create or replace function public.apply_position_capture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only units that belong to the capturing company move; an older capture never overwrites a newer one.
  if new.truck_id is not null and exists (select 1 from public.trucks where truck_id = new.truck_id and company_id = new.company_id) then
    insert into public.equipment_positions (unit_kind, unit_id, company_id, lat, lon, odometer, cause, captured_by, captured_at)
    values ('truck', new.truck_id, new.company_id, new.lat, new.lon, new.odometer, new.cause, new.user_id, new.captured_at)
    on conflict (unit_kind, unit_id) do update set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon,
      odometer = coalesce(excluded.odometer, public.equipment_positions.odometer), cause = excluded.cause,
      captured_by = excluded.captured_by, captured_at = excluded.captured_at
      where excluded.captured_at >= public.equipment_positions.captured_at;
  end if;
  if new.trailer_id is not null and exists (select 1 from public.trailers where trailer_id = new.trailer_id and company_id = new.company_id) then
    insert into public.equipment_positions (unit_kind, unit_id, company_id, lat, lon, odometer, cause, captured_by, captured_at)
    values ('trailer', new.trailer_id, new.company_id, new.lat, new.lon, null, new.cause, new.user_id, new.captured_at)
    on conflict (unit_kind, unit_id) do update set company_id = excluded.company_id, lat = excluded.lat, lon = excluded.lon,
      cause = excluded.cause, captured_by = excluded.captured_by, captured_at = excluded.captured_at
      where excluded.captured_at >= public.equipment_positions.captured_at;
  end if;
  return new;
end $$;
drop trigger if exists position_captures_apply on public.position_captures;
create trigger position_captures_apply after insert on public.position_captures for each row execute function public.apply_position_capture();
