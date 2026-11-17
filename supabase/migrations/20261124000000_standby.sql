-- Standby (on call volunteers), version one.
--   standby_markets : a dispatcher's saved list of local areas plus how many drivers are wanted on standby.
--   standby_signups : a driver's offered window (start, end). Withdrawn rows stay for history.
--   standby_positions(signup) : where a driver stands on each market list their local area is in, among the
--     windows that overlap theirs, earliest sign-up first (fairness ranking comes with calling in a later version).
-- Drivers never see other drivers' names: they get a position and a count back from the function.

create table if not exists public.standby_markets (
  market_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  local_areas text[] not null default '{}',
  required_count integer not null default 3 check (required_count >= 0),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists standby_markets_company on public.standby_markets (company_id);

create table if not exists public.standby_signups (
  signup_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (end_at > start_at)
);
create index if not exists standby_signups_company_time on public.standby_signups (company_id, start_at);
create index if not exists standby_signups_user on public.standby_signups (user_id, start_at);

alter table public.standby_markets enable row level security;
alter table public.standby_signups enable row level security;

drop policy if exists standby_markets_read on public.standby_markets;
create policy standby_markets_read on public.standby_markets for select
  using (exists (select 1 from public.user_companies uc where uc.company_id = standby_markets.company_id and uc.user_id = auth.uid()));
drop policy if exists standby_markets_write on public.standby_markets;
create policy standby_markets_write on public.standby_markets for all
  using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));

drop policy if exists standby_signups_read on public.standby_signups;
create policy standby_signups_read on public.standby_signups for select
  using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists standby_signups_insert on public.standby_signups;
create policy standby_signups_insert on public.standby_signups for insert
  with check (user_id = auth.uid() and exists (select 1 from public.user_companies uc where uc.company_id = standby_signups.company_id and uc.user_id = auth.uid()));
drop policy if exists standby_signups_update on public.standby_signups;
create policy standby_signups_update on public.standby_signups for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.standby_positions(p_signup_id uuid)
returns table (market_id uuid, market_name text, "position" integer, total integer, required integer)
language plpgsql security definer set search_path = public as $$
declare me public.standby_signups%rowtype; area text;
begin
  select * into me from public.standby_signups where signup_id = p_signup_id and user_id = auth.uid() and withdrawn_at is null;
  if not found then return; end if;
  select lower(btrim(local_area)) into area from public.profiles where user_id = auth.uid();
  if area is null or area = '' then return; end if;
  return query
    select m.market_id, m.name,
      (1 + (select count(*) from public.standby_signups s join public.profiles p on p.user_id = s.user_id
             where s.company_id = me.company_id and s.withdrawn_at is null and s.signup_id <> me.signup_id
               and tstzrange(s.start_at, s.end_at) && tstzrange(me.start_at, me.end_at)
               and lower(btrim(p.local_area)) in (select lower(btrim(x)) from unnest(m.local_areas) x)
               and (s.created_at < me.created_at or (s.created_at = me.created_at and s.signup_id < me.signup_id))))::integer,
      (1 + (select count(*) from public.standby_signups s join public.profiles p on p.user_id = s.user_id
             where s.company_id = me.company_id and s.withdrawn_at is null and s.signup_id <> me.signup_id
               and tstzrange(s.start_at, s.end_at) && tstzrange(me.start_at, me.end_at)
               and lower(btrim(p.local_area)) in (select lower(btrim(x)) from unnest(m.local_areas) x)))::integer,
      m.required_count
    from public.standby_markets m
    where m.company_id = me.company_id and m.is_active and area in (select lower(btrim(x)) from unnest(m.local_areas) x);
end $$;
revoke all on function public.standby_positions(uuid) from public, anon;
grant execute on function public.standby_positions(uuid) to authenticated;
