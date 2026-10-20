-- Plan slots (presets A-E) kept on the TRAILER, set by dispatch/lead/admin.
-- Whoever drives that trailer gets them in an empty slot of their own.
create table if not exists public.trailer_plan_slots (
  company_id uuid not null,
  trailer_id uuid not null,
  slot smallint not null check (slot between 1 and 5),
  name text,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (trailer_id, slot)
);
alter table public.trailer_plan_slots enable row level security;
drop policy if exists trailer_plan_slots_read on public.trailer_plan_slots;
create policy trailer_plan_slots_read on public.trailer_plan_slots for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists trailer_plan_slots_write on public.trailer_plan_slots;
create policy trailer_plan_slots_write on public.trailer_plan_slots for all to authenticated
  using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
