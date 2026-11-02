-- Reimbursements. A fuel stop paid with My Card or Cash (fuel_purchase_payments.is_personal) makes one record
-- automatically, so the driver never files anything and an admin sees what the company owes by driver and period.
-- A trigger writes it, so the existing offline fuel path needs no change. The amount follows edits while the
-- record is still pending; once an admin decides it, the amount is frozen.

create table if not exists public.reimbursements (
  reimbursement_id uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(company_id) on delete cascade,
  driver_id    uuid not null references auth.users(id) on delete cascade,
  source       text not null check (source in ('fuel', 'other')),
  source_id    uuid,                       -- the fuel stop
  amount       numeric not null check (amount >= 0),
  description  text not null default '',
  expense_date timestamptz not null default now(),
  receipt_path text,                       -- in the fuel-receipts bucket
  status       text not null default 'pending' check (status in ('pending', 'approved', 'paid', 'denied')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  paid_at      timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists reimbursements_company_idx on public.reimbursements (company_id, expense_date desc);
create index if not exists reimbursements_driver_idx on public.reimbursements (driver_id, expense_date desc);

alter table public.reimbursements enable row level security;
drop policy if exists reimbursements_select on public.reimbursements;
create policy reimbursements_select on public.reimbursements for select to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id));
-- Only admins decide. No insert policy: the trigger below is the only writer.
drop policy if exists reimbursements_update on public.reimbursements;
create policy reimbursements_update on public.reimbursements for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create or replace function public.sync_fuel_reimbursement() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.fuel_purchases%rowtype;
begin
  if coalesce(new.is_personal, false) and coalesce(new.total_amount, 0) > 0 then
    select * into p from public.fuel_purchases where id = new.purchase_id;
    insert into public.reimbursements (company_id, driver_id, source, source_id, amount, description, expense_date, receipt_path)
    values (new.company_id, new.driver_id, 'fuel', new.purchase_id, new.total_amount,
            btrim(concat_ws(' · ', coalesce(p.store_name, 'Fuel'), nullif(concat_ws(', ', p.city, p.state), ''),
                            case when p.diesel_gallons is not null then p.diesel_gallons::text || ' gal' end)),
            coalesce(p.finished_at, p.started_at, now()), new.receipt_path)
    on conflict (source, source_id) do update
      set amount = excluded.amount, description = excluded.description, receipt_path = excluded.receipt_path,
          expense_date = excluded.expense_date, updated_at = now()
      where public.reimbursements.status = 'pending';
  else
    -- No longer an out-of-pocket purchase with an amount: drop it while nobody has decided it.
    delete from public.reimbursements where source = 'fuel' and source_id = new.purchase_id and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_fuel_reimbursement on public.fuel_purchase_payments;
create trigger trg_sync_fuel_reimbursement after insert or update on public.fuel_purchase_payments
  for each row execute function public.sync_fuel_reimbursement();

-- Records for what was already paid out of pocket.
insert into public.reimbursements (company_id, driver_id, source, source_id, amount, description, expense_date, receipt_path)
select pay.company_id, pay.driver_id, 'fuel', pay.purchase_id, pay.total_amount,
       btrim(concat_ws(' · ', coalesce(p.store_name, 'Fuel'), nullif(concat_ws(', ', p.city, p.state), ''),
                       case when p.diesel_gallons is not null then p.diesel_gallons::text || ' gal' end)),
       coalesce(p.finished_at, p.started_at, now()), pay.receipt_path
from public.fuel_purchase_payments pay
join public.fuel_purchases p on p.id = pay.purchase_id
where pay.is_personal and coalesce(pay.total_amount, 0) > 0
on conflict (source, source_id) do nothing;
