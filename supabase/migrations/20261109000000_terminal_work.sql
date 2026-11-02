-- Terminal and transload work: time a driver spends at a terminal doing something other than loading their own
-- load (a rail or vessel transload, marshaling, a truck-to-tank transfer, loading product for others, yard work,
-- training), kept with a timer. Billable defaults per activity, set by the company; an admin can override a record
-- and every override is kept (who, when, what), so the history is never lost.
--   terminal_work: one timed record. ended_at is null while the timer runs. billable is what the activity's
--     default was when it started.
--   terminal_work_overrides: append-only decisions by an admin; the latest wins.
--   terminal_work_defaults: the company's billable default per activity (none set = the built-in one).

create table if not exists public.terminal_work (
  work_id       uuid primary key,
  company_id    uuid not null references public.companies(company_id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  activity      text not null check (activity in ('rail_transload', 'vessel_transload', 'marshaling', 'truck_to_tank', 'loading_for_others', 'yard_work', 'training')),
  terminal_id   uuid,
  terminal_name text,
  product_id    uuid,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  note          text,
  billable      boolean not null default false,
  source        text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  client_updated_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists terminal_work_company_idx on public.terminal_work (company_id, started_at desc);
create index if not exists terminal_work_user_idx on public.terminal_work (user_id, started_at desc);
alter table public.terminal_work enable row level security;
drop policy if exists terminal_work_select on public.terminal_work;
create policy terminal_work_select on public.terminal_work for select using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists terminal_work_insert on public.terminal_work;
create policy terminal_work_insert on public.terminal_work for insert with check (user_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists terminal_work_update on public.terminal_work;
create policy terminal_work_update on public.terminal_work for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_company_member(company_id));

create table if not exists public.terminal_work_overrides (
  override_id uuid primary key default gen_random_uuid(),
  work_id     uuid not null references public.terminal_work(work_id) on delete cascade,
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  billable    boolean not null,
  note        text,
  set_by      uuid references auth.users(id),
  set_at      timestamptz not null default now()
);
create index if not exists terminal_work_overrides_work_idx on public.terminal_work_overrides (work_id, set_at desc);
alter table public.terminal_work_overrides enable row level security;
drop policy if exists terminal_work_overrides_select on public.terminal_work_overrides;
create policy terminal_work_overrides_select on public.terminal_work_overrides for select using (public.is_company_admin(company_id));
drop policy if exists terminal_work_overrides_insert on public.terminal_work_overrides;
create policy terminal_work_overrides_insert on public.terminal_work_overrides for insert with check (public.is_company_admin(company_id) and set_by = auth.uid());
-- No update or delete: the history stays.

create table if not exists public.terminal_work_defaults (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  activity   text not null,
  billable   boolean not null,
  primary key (company_id, activity)
);
alter table public.terminal_work_defaults enable row level security;
drop policy if exists terminal_work_defaults_select on public.terminal_work_defaults;
create policy terminal_work_defaults_select on public.terminal_work_defaults for select using (public.is_company_member(company_id));
drop policy if exists terminal_work_defaults_write on public.terminal_work_defaults;
create policy terminal_work_defaults_write on public.terminal_work_defaults for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
