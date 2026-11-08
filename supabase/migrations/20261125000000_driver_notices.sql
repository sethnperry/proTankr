-- Driver notices: short messages from dispatch that show on the driver's dashboard
-- (e.g. "Meet John G at Shell to load, ETA 1:30 PM"). Plain notifications, no pairing.
-- NOT YET APPLIED: needs the build session with database access. The app reads this
-- table fail-open (no table = no notices) and the Plan page's "Send notices" shows an
-- honest error until it exists.
create table if not exists public.driver_notices (
  notice_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,          -- the driver who sees it
  from_user_id uuid,              -- the dispatcher who sent it
  kind text not null default 'meet',
  title text not null,
  body text,
  payload jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists driver_notices_user_open on public.driver_notices (user_id, created_at desc) where seen_at is null;

alter table public.driver_notices enable row level security;

-- The driver reads and dismisses their own.
create policy driver_notices_read_own on public.driver_notices for select using (user_id = auth.uid());
create policy driver_notices_dismiss_own on public.driver_notices for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Staff (admin / dispatch / lead / owner) send them within their company.
create policy driver_notices_staff_send on public.driver_notices for insert with check (public.is_company_staff(company_id));
create policy driver_notices_staff_read on public.driver_notices for select using (public.is_company_staff(company_id));
