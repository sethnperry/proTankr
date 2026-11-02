-- Spotted Lanternfly. In some counties a vehicle must be inspected for the insect and the driver attests it.
--   slf_zone_counties: the counties that count, a company setting (state + county). Not seeded: the state's list
--     changes, so the company enters it from its own agriculture department's current zone list.
--   terminal_counties: a cache of which county each terminal is in (filled by the server from the terminal's
--     coordinates), because a terminal row has none.
--   slf_attestations: one per trip per county entered: cab exterior, frame rails and tool box, and the trailer,
--     checked by the driver. Append-only.

create table if not exists public.slf_zone_counties (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  state      text not null check (length(state) = 2),
  county     text not null check (length(btrim(county)) > 0),
  created_at timestamptz not null default now(),
  primary key (company_id, state, county)
);
alter table public.slf_zone_counties enable row level security;
drop policy if exists slf_zone_select on public.slf_zone_counties;
create policy slf_zone_select on public.slf_zone_counties for select using (public.is_company_member(company_id));
drop policy if exists slf_zone_write on public.slf_zone_counties;
create policy slf_zone_write on public.slf_zone_counties for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.terminal_counties (
  terminal_id uuid primary key,
  county      text,
  state       text,
  checked_at  timestamptz not null default now()
);
alter table public.terminal_counties enable row level security;
drop policy if exists terminal_counties_select on public.terminal_counties;
create policy terminal_counties_select on public.terminal_counties for select to authenticated using (true);
-- Written only by the server (service role).

create table if not exists public.slf_attestations (
  trip_id        uuid not null references public.trips(trip_id) on delete cascade,
  state          text not null,
  county         text not null,
  company_id     uuid not null references public.companies(company_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  cab_exterior   boolean not null,
  frame_tool_box boolean not null,
  trailer        boolean not null,
  attested_at    timestamptz not null default now(),
  source         text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  client_updated_at timestamptz,
  primary key (trip_id, state, county),
  check (cab_exterior and frame_tool_box and trailer)
);
create index if not exists slf_attestations_company_idx on public.slf_attestations (company_id, attested_at desc);
alter table public.slf_attestations enable row level security;
drop policy if exists slf_attest_select on public.slf_attestations;
create policy slf_attest_select on public.slf_attestations for select using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists slf_attest_insert on public.slf_attestations;
create policy slf_attest_insert on public.slf_attestations for insert with check (user_id = auth.uid() and public.is_company_member(company_id));
-- No update or delete: an attestation is a record.
