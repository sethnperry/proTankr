-- Trip workflow: changes from the first tap-through (2026-10-10).
-- Design: docs/trip-workflow-design.md
--
-- Purely additive. Re-runnable.
--
-- 1. suppliers: a company list of suppliers, so the same supplier is always
--    picked from a list instead of typed a new way each time. Synced through
--    the phone's trip store like every other trip table (phone-made ids,
--    newest client edit wins).
-- 2. trip_compartment_loads.supplier_id: the picked supplier. The old text
--    column `supplier` stays and keeps the name, so the PTD and older rows
--    still read.
-- 3. delivery_locations.zip: the full street address for mapping later.

begin;

-- ---------------------------------------------------------------------------
-- 1. Suppliers
-- ---------------------------------------------------------------------------

create table if not exists public.suppliers (
  supplier_id uuid primary key,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz
);

create index if not exists suppliers_company_idx on public.suppliers (company_id) where is_active;

alter table public.suppliers enable row level security;

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers
  for select using (public.trip_company_member(company_id));
drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert with check (public.trip_company_member(company_id));
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update using (public.trip_company_member(company_id))
  with check (public.trip_company_member(company_id));

drop trigger if exists suppliers_sync on public.suppliers;
create trigger suppliers_sync before insert or update on public.suppliers
  for each row execute function public.trip_sync_write();

-- ---------------------------------------------------------------------------
-- 2. Compartment supplier
-- ---------------------------------------------------------------------------

alter table public.trip_compartment_loads
  add column if not exists supplier_id uuid references public.suppliers(supplier_id) on delete set null;

-- Turn any supplier names already typed into list entries, one per company and
-- name (case and spacing ignored), and link the rows to them.
insert into public.suppliers (supplier_id, company_id, name, created_by)
select gen_random_uuid(), x.company_id, x.name, null
from (
  select distinct on (t.company_id, upper(regexp_replace(trim(cl.supplier), '\s+', ' ', 'g')))
         t.company_id, regexp_replace(trim(cl.supplier), '\s+', ' ', 'g') as name
  from public.trip_compartment_loads cl
  join public.trips t on t.trip_id = cl.trip_id
  where cl.supplier is not null and length(trim(cl.supplier)) > 0
  order by t.company_id, upper(regexp_replace(trim(cl.supplier), '\s+', ' ', 'g')), cl.created_at
) x
where not exists (
  select 1 from public.suppliers s
  where s.company_id = x.company_id
    and upper(regexp_replace(trim(s.name), '\s+', ' ', 'g')) = upper(x.name)
);

update public.trip_compartment_loads cl
set supplier_id = s.supplier_id
from public.trips t, public.suppliers s
where t.trip_id = cl.trip_id
  and s.company_id = t.company_id
  and cl.supplier_id is null
  and cl.supplier is not null
  and upper(regexp_replace(trim(s.name), '\s+', ' ', 'g'))
      = upper(regexp_replace(trim(cl.supplier), '\s+', ' ', 'g'));

-- ---------------------------------------------------------------------------
-- 3. Delivery location zip
-- ---------------------------------------------------------------------------

alter table public.delivery_locations add column if not exists zip text;

commit;
