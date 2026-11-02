-- Call-outs 2.0. A driver calls out of a shift; dispatch and the regional manager are emailed; the driver can
-- withdraw until the shift starts; a dispatcher can create, edit or withdraw one for a driver (with who did it,
-- and a correction email). While a call-out is active the dispatch board won't complete a plan for that driver on
-- that day until the record is corrected (withdrawn or changed).
--   callout_routes: who gets the email, by region, local area and department (DEF is a department). The most
--     specific match wins; a row with none of the three is the company default. kind: dispatch or manager.
--   callouts: one per call-out. status active or withdrawn. shift_start_at is when the shift was to start (the
--     driver's chosen time, stored as a moment), which is when withdrawing by the driver stops being allowed.

create table if not exists public.callout_routes (
  route_id    uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  kind        text not null check (kind in ('dispatch', 'manager')),
  email       text not null check (position('@' in email) > 1),
  region      text,
  local_area  text,
  department  text,
  created_at  timestamptz not null default now()
);
create index if not exists callout_routes_company_idx on public.callout_routes (company_id);
alter table public.callout_routes enable row level security;
drop policy if exists callout_routes_select on public.callout_routes;
create policy callout_routes_select on public.callout_routes for select using (public.is_company_member(company_id));
drop policy if exists callout_routes_write on public.callout_routes;
create policy callout_routes_write on public.callout_routes for all
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.callouts (
  callout_id     uuid primary key,
  company_id     uuid not null references public.companies(company_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,     -- the driver
  shift_date     date not null,
  shift_start_at timestamptz not null,
  reason         text not null,
  reason_id      uuid,
  category       text,
  note           text,
  department     text,
  region         text,                                                          -- the driver's, when it was made
  local_area     text,
  status         text not null default 'active' check (status in ('active', 'withdrawn')),
  created_by     uuid not null references auth.users(id),
  updated_by     uuid references auth.users(id),
  withdrawn_by   uuid references auth.users(id),
  withdrawn_at   timestamptz,
  notified       jsonb not null default '{}'::jsonb,   -- which emails went: {created, edited, withdrawn} -> time
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  client_updated_at timestamptz
);
create index if not exists callouts_company_idx on public.callouts (company_id, shift_date desc);
create index if not exists callouts_user_idx on public.callouts (user_id, shift_date desc);
alter table public.callouts enable row level security;
drop policy if exists callouts_select on public.callouts;
create policy callouts_select on public.callouts for select using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists callouts_insert on public.callouts;
create policy callouts_insert on public.callouts for insert with check (
  created_by = auth.uid() and public.is_company_member(company_id)
  and (user_id = auth.uid() or public.is_company_staff(company_id)));
drop policy if exists callouts_update on public.callouts;
create policy callouts_update on public.callouts for update
  using (user_id = auth.uid() or public.is_company_staff(company_id))
  with check (user_id = auth.uid() or public.is_company_staff(company_id));

-- A driver can change or withdraw their own call-out only until the shift starts, and nobody can rewrite who it
-- is for or who made it. (The server marks emails sent with the service role, which has no auth.uid().)
create or replace function public.callouts_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id <> old.user_id or new.company_id <> old.company_id or new.created_by <> old.created_by then
    raise exception 'A call-out cannot change who it is for or who made it.';
  end if;
  if not public.is_company_staff(old.company_id) and old.shift_start_at <= now() then
    raise exception 'The shift has started, so this call-out can only be changed by dispatch.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_callouts_guard on public.callouts;
create trigger trg_callouts_guard before update on public.callouts for each row execute function public.callouts_guard();
