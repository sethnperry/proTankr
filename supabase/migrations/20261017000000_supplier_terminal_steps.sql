-- Supplier loading steps per terminal, a shared terminal note, and
-- supplier-level allocation reports (2026-10-17).
--
-- Purely additive. Re-runnable.
--
-- 1. supplier_terminal_steps: one row per company + supplier + terminal. The
--    numbered screens and notes for getting a supplier running at that
--    terminal's loading computer (account numbers live here). Company-only.
--    It also links a supplier to a terminal so the picker can show that
--    terminal's suppliers first; the row is made the first time a driver
--    picks the supplier there.
-- 2. terminal_notes: one shared note per terminal, readable and editable by
--    every signed-in user (every company). It must not hold account numbers:
--    a run of 5 or more digits is refused here as well as in the app.
-- 3. terminal_outage_reports.supplier_id / supplier_name: an Out of
--    Allocation report can name the supplier ("No Allocation - Atlas - MO").
--    Allocation reports stay company-only (existing RLS).

begin;

-- ---------------------------------------------------------------------------
-- 1. Supplier steps per terminal (company-only)
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_terminal_steps (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  supplier_id uuid not null references public.suppliers(supplier_id) on delete cascade,
  terminal_id uuid not null references public.terminals(terminal_id) on delete cascade,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  notes text,
  updated_by uuid references auth.users(id),
  steps_updated_at timestamptz,
  last_used_at timestamptz,
  last_loaded_at timestamptz,
  last_loaded_by uuid references auth.users(id),
  issue_at timestamptz,
  issue_by uuid references auth.users(id),
  issue_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (supplier_id, terminal_id)
);

create index if not exists supplier_terminal_steps_terminal_idx
  on public.supplier_terminal_steps (company_id, terminal_id);

alter table public.supplier_terminal_steps enable row level security;

drop policy if exists supplier_terminal_steps_read on public.supplier_terminal_steps;
create policy supplier_terminal_steps_read on public.supplier_terminal_steps
  for select using (public.trip_company_member(company_id));
drop policy if exists supplier_terminal_steps_insert on public.supplier_terminal_steps;
create policy supplier_terminal_steps_insert on public.supplier_terminal_steps
  for insert with check (
    public.trip_company_member(company_id)
    and exists (select 1 from public.suppliers s where s.supplier_id = supplier_terminal_steps.supplier_id and s.company_id = supplier_terminal_steps.company_id)
  );
drop policy if exists supplier_terminal_steps_update on public.supplier_terminal_steps;
create policy supplier_terminal_steps_update on public.supplier_terminal_steps
  for update using (public.trip_company_member(company_id))
  with check (public.trip_company_member(company_id));

-- ---------------------------------------------------------------------------
-- 2. Shared terminal note (every company)
-- ---------------------------------------------------------------------------

create table if not exists public.terminal_notes (
  terminal_id uuid primary key references public.terminals(terminal_id) on delete cascade,
  note text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- No account numbers in a note every company can read: no run of 5+ digits
-- and no split number like "2001 4625". Phone numbers are allowed (stripped
-- before the check). The app runs the same check (lib/suppliers/noteGuard.ts).
alter table public.terminal_notes drop constraint if exists terminal_notes_no_account_numbers;
alter table public.terminal_notes add constraint terminal_notes_no_account_numbers check (
  regexp_replace(note, '\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-][0-9]{4}', '', 'g')
    !~ '([0-9]{5,}|[0-9]{3,}[ .-][0-9]{3,})'
);

alter table public.terminal_notes enable row level security;

drop policy if exists terminal_notes_read on public.terminal_notes;
create policy terminal_notes_read on public.terminal_notes
  for select using (auth.uid() is not null);
drop policy if exists terminal_notes_insert on public.terminal_notes;
create policy terminal_notes_insert on public.terminal_notes
  for insert with check (auth.uid() is not null and updated_by = auth.uid());
drop policy if exists terminal_notes_update on public.terminal_notes;
create policy terminal_notes_update on public.terminal_notes
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null and updated_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Supplier on allocation reports
-- ---------------------------------------------------------------------------

alter table public.terminal_outage_reports
  add column if not exists supplier_id uuid references public.suppliers(supplier_id) on delete set null,
  add column if not exists supplier_name text;

commit;
