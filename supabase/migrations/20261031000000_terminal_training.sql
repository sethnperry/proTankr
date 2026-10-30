-- Terminal training (2026-10-31).
--
-- Some terminals require training that has to be repeated (for example an
-- online course due every year). This is separate from the card's renewal
-- period (terminals.renewal_days) and from the one-time access steps.
--
-- terminal_training: what a terminal asks for. One row per terminal, shared by
--   every company, editable by any signed-in user (same open model as
--   terminal_access_requirements).
-- driver_terminal_training: one row per driver per terminal. expires_at is the
--   date the driver's training lapses ("complete it before ...").

create table if not exists public.terminal_training (
  terminal_id uuid primary key references public.terminals(terminal_id) on delete cascade,
  required boolean not null default true,
  mode text check (mode in ('online', 'video', 'in_person', 'other')),
  url text,
  instructions text,
  renewal_months int check (renewal_months between 1 and 60),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create or replace function public.terminal_training_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
drop trigger if exists trg_terminal_training_touch on public.terminal_training;
create trigger trg_terminal_training_touch before insert or update on public.terminal_training
  for each row execute function public.terminal_training_touch();

alter table public.terminal_training enable row level security;
drop policy if exists tt_read on public.terminal_training;
create policy tt_read on public.terminal_training for select to authenticated using (true);
drop policy if exists tt_insert on public.terminal_training;
create policy tt_insert on public.terminal_training for insert to authenticated with check (auth.uid() is not null);
drop policy if exists tt_update on public.terminal_training;
create policy tt_update on public.terminal_training for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists public.driver_terminal_training (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  terminal_id uuid not null references public.terminals(terminal_id) on delete cascade,
  company_id uuid,
  completed_at date,
  expires_at date,
  updated_at timestamptz not null default now(),
  unique (user_id, terminal_id)
);

create or replace function public.driver_terminal_training_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_driver_terminal_training_touch on public.driver_terminal_training;
create trigger trg_driver_terminal_training_touch before update on public.driver_terminal_training
  for each row execute function public.driver_terminal_training_touch();

alter table public.driver_terminal_training enable row level security;
drop policy if exists dtt_read on public.driver_terminal_training;
create policy dtt_read on public.driver_terminal_training for select to authenticated
  using (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)));
drop policy if exists dtt_insert on public.driver_terminal_training;
create policy dtt_insert on public.driver_terminal_training for insert to authenticated
  with check (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)));
drop policy if exists dtt_update on public.driver_terminal_training;
create policy dtt_update on public.driver_terminal_training for update to authenticated
  using (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)))
  with check (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)));
drop policy if exists dtt_delete on public.driver_terminal_training;
create policy dtt_delete on public.driver_terminal_training for delete to authenticated using (user_id = auth.uid());
