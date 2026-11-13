-- A note left on a trailer that still has product aboard (Retain on the delivery screen). Shown as a big alert
-- to whoever holds that trailer, until it is cleared.
create table if not exists public.trailer_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  trailer_id uuid not null references public.trailers(trailer_id) on delete cascade,
  trip_id uuid,
  note text not null,
  compartments int[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references auth.users(id)
);
create index if not exists trailer_alerts_open on public.trailer_alerts (trailer_id) where cleared_at is null;
alter table public.trailer_alerts enable row level security;
drop policy if exists trailer_alerts_read on public.trailer_alerts;
create policy trailer_alerts_read on public.trailer_alerts for select using (public.is_company_member(company_id));
drop policy if exists trailer_alerts_insert on public.trailer_alerts;
create policy trailer_alerts_insert on public.trailer_alerts for insert with check (public.is_company_member(company_id) and created_by = auth.uid());
drop policy if exists trailer_alerts_update on public.trailer_alerts;
create policy trailer_alerts_update on public.trailer_alerts for update using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
