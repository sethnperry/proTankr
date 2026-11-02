-- Billing flags on a trip's empty (deadhead) segments. An admin decides, per segment, whether it is billable.
-- Internal only: it never appears on the PTD itself. No row = not reviewed yet.

create table if not exists public.trip_billing_flags (
  trip_id     uuid not null references public.trips(trip_id) on delete cascade,
  segment_key text not null,
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  billable    boolean not null,
  set_by      uuid references auth.users(id),
  set_at      timestamptz not null default now(),
  primary key (trip_id, segment_key)
);
create index if not exists trip_billing_flags_company_idx on public.trip_billing_flags (company_id, set_at desc);
alter table public.trip_billing_flags enable row level security;
drop policy if exists trip_billing_flags_select on public.trip_billing_flags;
create policy trip_billing_flags_select on public.trip_billing_flags for select using (public.is_company_admin(company_id));
drop policy if exists trip_billing_flags_write on public.trip_billing_flags;
create policy trip_billing_flags_write on public.trip_billing_flags for all
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
