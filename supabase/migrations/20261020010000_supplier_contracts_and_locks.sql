-- Dispatch suppliers screen: account number, dispatcher locks, contract terms.
-- Additive. Locks are enforced here, not just in the app: a driver's save can't
-- change a field or step dispatch has locked.

begin;

-- Who manages suppliers: admins (and owners, super admins) and dispatchers.
create or replace function public.can_manage_suppliers(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_company_admin(p_company_id)
      or exists (
        select 1 from public.user_companies uc
        where uc.user_id = auth.uid() and uc.company_id = p_company_id and uc.role = 'dispatch'
      );
$$;

alter table public.supplier_terminal_steps
  add column if not exists account_number text,
  add column if not exists account_locked boolean not null default false,
  -- One boolean per entry in steps, same order.
  add column if not exists step_locks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(step_locks) = 'array');

drop policy if exists supplier_terminal_steps_delete on public.supplier_terminal_steps;
create policy supplier_terminal_steps_delete on public.supplier_terminal_steps
  for delete using (public.can_manage_suppliers(company_id));

create or replace function public.enforce_supplier_locks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  i integer;
begin
  -- Service role / SQL editor, and managers, are never held to the locks.
  if auth.uid() is null or public.can_manage_suppliers(new.company_id) then
    return new;
  end if;
  if new.account_locked is distinct from old.account_locked
     or new.step_locks is distinct from old.step_locks then
    raise exception 'Only dispatch can lock or unlock fields.';
  end if;
  if old.account_locked and new.account_number is distinct from old.account_number then
    raise exception 'The account number is locked by dispatch.';
  end if;
  for i in 0 .. coalesce(jsonb_array_length(old.step_locks), 0) - 1 loop
    if (old.step_locks -> i) = 'true'::jsonb and (new.steps -> i) is distinct from (old.steps -> i) then
      raise exception 'Step % is locked by dispatch.', i + 1;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists supplier_terminal_steps_locks on public.supplier_terminal_steps;
create trigger supplier_terminal_steps_locks before update on public.supplier_terminal_steps
  for each row execute function public.enforce_supplier_locks();

-- Contract terms for a supplier at a terminal. Warn-only: nothing here blocks
-- a load. Usage against the limits comes later.
create table if not exists public.supplier_contracts (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  supplier_id uuid not null references public.suppliers(supplier_id) on delete cascade,
  terminal_id uuid not null references public.terminals(terminal_id) on delete cascade,
  limit_basis text not null default 'loads' check (limit_basis in ('loads','gallons')),
  per_day numeric check (per_day is null or per_day >= 0),
  per_week numeric check (per_week is null or per_week >= 0),
  -- Day the week resets (0 = Sunday) and the time of day the day resets.
  reset_dow smallint not null default 0 check (reset_dow between 0 and 6),
  reset_time time not null default '00:00',
  paused boolean not null default false,
  paused_note text,
  paused_at timestamptz,
  paused_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (supplier_id, terminal_id)
);

alter table public.supplier_contracts enable row level security;

drop policy if exists supplier_contracts_read on public.supplier_contracts;
create policy supplier_contracts_read on public.supplier_contracts
  for select using (public.trip_company_member(company_id));
drop policy if exists supplier_contracts_insert on public.supplier_contracts;
create policy supplier_contracts_insert on public.supplier_contracts
  for insert with check (public.can_manage_suppliers(company_id));
drop policy if exists supplier_contracts_update on public.supplier_contracts;
create policy supplier_contracts_update on public.supplier_contracts
  for update using (public.can_manage_suppliers(company_id))
  with check (public.can_manage_suppliers(company_id));
drop policy if exists supplier_contracts_delete on public.supplier_contracts;
create policy supplier_contracts_delete on public.supplier_contracts
  for delete using (public.can_manage_suppliers(company_id));

commit;
