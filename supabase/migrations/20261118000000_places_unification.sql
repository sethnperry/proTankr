-- Places: one list of every place a company goes (stores, yards, shops, fuel, shippers, terminals).
-- delivery_locations already holds stores/yards/maintenance/terminal; this adds two kinds and a link to the shared
-- terminal catalog. A terminal becomes a company place only when the company first uses it (ensure_terminal_place).

alter table public.delivery_locations drop constraint if exists delivery_locations_place_kind_check;
alter table public.delivery_locations add constraint delivery_locations_place_kind_check
  check (place_kind in ('store', 'yard', 'maintenance', 'terminal', 'fuel', 'shipper'));

alter table public.delivery_locations add column if not exists terminal_id uuid;
create unique index if not exists delivery_locations_company_terminal_uq
  on public.delivery_locations (company_id, terminal_id) where terminal_id is not null;

create or replace function public.ensure_terminal_place(p_company_id uuid, p_terminal_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; t record;
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Access denied'; end if;
  select location_id into v_id from public.delivery_locations where company_id = p_company_id and terminal_id = p_terminal_id;
  if v_id is not null then return v_id; end if;
  select terminal_name, city, state, lat, lon into t from public.terminals where terminal_id = p_terminal_id;
  if not found then raise exception 'Unknown terminal'; end if;
  insert into public.delivery_locations (company_id, name, city, state, lat, lon, place_kind, terminal_id, delivery_type, created_by)
  values (p_company_id, t.terminal_name, t.city, t.state, t.lat, t.lon, 'terminal', p_terminal_id, 'drop', auth.uid())
  on conflict (company_id, terminal_id) where terminal_id is not null do nothing
  returning location_id into v_id;
  if v_id is null then select location_id into v_id from public.delivery_locations where company_id = p_company_id and terminal_id = p_terminal_id; end if;
  return v_id;
end $$;
revoke all on function public.ensure_terminal_place(uuid, uuid) from public, anon;
grant execute on function public.ensure_terminal_place(uuid, uuid) to authenticated;

-- Empty moves: a truck going somewhere with no load (bobtail, empty return, repositioning). Lightweight; not a trip.
create table if not exists public.empty_moves (
  move_id          uuid primary key,
  company_id       uuid not null references public.companies(company_id) on delete cascade,
  driver_id        uuid not null references auth.users(id) on delete cascade,
  truck_id         uuid,
  trailer_id       uuid,
  kind             text not null default 'bobtail' check (kind in ('bobtail', 'empty_return', 'reposition')),
  from_place_id    uuid,
  from_text        text,
  to_place_id      uuid,
  to_text          text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  begin_miles      numeric,
  end_miles        numeric,
  billable         boolean,
  notes            text,
  source           text not null default 'app' check (source in ('app', 'geotab', 'manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  client_updated_at timestamptz
);
create index if not exists empty_moves_company_idx on public.empty_moves (company_id, started_at desc);
create index if not exists empty_moves_driver_idx on public.empty_moves (driver_id, started_at desc);
create unique index if not exists empty_moves_one_open_per_driver on public.empty_moves (driver_id) where ended_at is null;

drop trigger if exists empty_moves_sync on public.empty_moves;
create trigger empty_moves_sync before insert or update on public.empty_moves for each row execute function public.trip_sync_write();
alter table public.empty_moves enable row level security;
drop policy if exists empty_moves_select on public.empty_moves;
create policy empty_moves_select on public.empty_moves for select using (driver_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists empty_moves_insert on public.empty_moves;
create policy empty_moves_insert on public.empty_moves for insert with check (driver_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists empty_moves_update on public.empty_moves;
create policy empty_moves_update on public.empty_moves for update using (driver_id = auth.uid() or public.is_company_staff(company_id))
  with check (public.is_company_member(company_id));
