-- Driver setup checklist: the one thing that can't be worked out from existing data is "the driver looked at what
-- the admin preset and said it's right". One row per driver per step. Everything else on the checklist is computed
-- from data already stored (see lib/setup/driverSetup.ts).
create table if not exists public.driver_setup_confirmations (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  step text not null,
  confirmed_at timestamptz not null default now(),
  primary key (user_id, step)
);
create index if not exists driver_setup_confirmations_company_idx on public.driver_setup_confirmations (company_id);
alter table public.driver_setup_confirmations enable row level security;

drop policy if exists driver_setup_conf_select on public.driver_setup_confirmations;
create policy driver_setup_conf_select on public.driver_setup_confirmations for select
  using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists driver_setup_conf_insert on public.driver_setup_confirmations;
create policy driver_setup_conf_insert on public.driver_setup_confirmations for insert
  with check (user_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists driver_setup_conf_update on public.driver_setup_confirmations;
create policy driver_setup_conf_update on public.driver_setup_confirmations for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists driver_setup_conf_delete on public.driver_setup_confirmations;
create policy driver_setup_conf_delete on public.driver_setup_confirmations for delete
  using (user_id = auth.uid());
