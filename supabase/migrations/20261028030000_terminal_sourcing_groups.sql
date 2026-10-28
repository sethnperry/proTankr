-- Terminals that share sourcing (suppliers, steps, notes) within a company, e.g. Buckey North and
-- Buckey South. The app mirrors every supplier/steps write to all terminals in the group.
create table if not exists public.terminal_sourcing_groups (
  company_id uuid not null,
  terminal_id uuid not null,
  group_key text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, terminal_id)
);
alter table public.terminal_sourcing_groups enable row level security;
drop policy if exists tsg_read on public.terminal_sourcing_groups;
create policy tsg_read on public.terminal_sourcing_groups for select using (company_id = public.get_active_company_id());
drop policy if exists tsg_write on public.terminal_sourcing_groups;
create policy tsg_write on public.terminal_sourcing_groups for all
  using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));

-- Buckey North + Buckey South (Tampa) for this company.
insert into public.terminal_sourcing_groups (company_id, terminal_id, group_key)
select '25042e28-1b7a-4e85-92ce-db9171ca0682', t.terminal_id, 'buckey-tampa'
from public.terminals t where t.terminal_id in ('155425e2-88b5-45e8-900a-c0b7c79f2096','61b0c1b3-cbce-4407-8923-0e9432cab695')
on conflict do nothing;

-- Give each terminal the other's suppliers and steps (the existing row wins).
insert into public.supplier_terminal_steps (company_id, supplier_id, terminal_id, steps, notes, account_number, account_locked, step_locks, updated_by, steps_updated_at, last_used_at, last_loaded_at, last_loaded_by, issue_at, issue_by, issue_note)
select s.company_id, s.supplier_id, o.terminal_id, s.steps, s.notes, s.account_number, s.account_locked, s.step_locks, s.updated_by, s.steps_updated_at, s.last_used_at, s.last_loaded_at, s.last_loaded_by, s.issue_at, s.issue_by, s.issue_note
from public.supplier_terminal_steps s
join public.terminal_sourcing_groups g on g.company_id = s.company_id and g.terminal_id = s.terminal_id
join public.terminal_sourcing_groups o on o.company_id = g.company_id and o.group_key = g.group_key and o.terminal_id <> g.terminal_id
on conflict (supplier_id, terminal_id) do nothing;
