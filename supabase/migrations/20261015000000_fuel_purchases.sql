-- Fuel stops (2026-10-15).
--
-- fuel_settings: per company. Receipt photo required or not, DEF on/off, and a
--   company guide (image or PDF: SOP, reminders) shown at the island.
-- fuel_payment_methods: what the company admin sets up (RFID program, company
--   account, fuel cards). Numbered pump steps plus an optional image/PDF guide.
--   Card numbers and PINs are never stored, only a label and last 4.
-- fuel_purchases: one row per fuel stop. Shared with the company (equipment
--   history): times, odometer, gallons, store, how it was paid, failed attempts.
-- fuel_purchase_payments: the money side. Company-paid rows are visible to the
--   company; out-of-pocket rows (personal card, cash) only to the driver and
--   company admins. The vault link for a personal card lives here too.
-- Receipts go in a new private bucket, fuel-receipts, path
--   {company_id}/{user_id}/{company|personal}/{file}.

create table if not exists public.fuel_settings (
  company_id uuid primary key references public.companies(company_id) on delete cascade,
  require_receipt boolean not null default false,
  def_enabled boolean not null default true,
  guide_path text,
  guide_name text,
  guide_mime text,
  updated_at timestamptz not null default now()
);

alter table public.fuel_settings enable row level security;
drop policy if exists fuel_settings_read on public.fuel_settings;
create policy fuel_settings_read on public.fuel_settings for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists fuel_settings_write on public.fuel_settings;
create policy fuel_settings_write on public.fuel_settings for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.fuel_payment_methods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  kind text not null check (kind in ('rfid', 'company_account', 'fuel_card')),
  name text not null,
  account_number text,
  card_last4 text,
  steps text[] not null default '{}',
  guide_path text,
  guide_name text,
  guide_mime text,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fuel_payment_methods_company on public.fuel_payment_methods(company_id, sort);

alter table public.fuel_payment_methods enable row level security;
drop policy if exists fuel_methods_read on public.fuel_payment_methods;
create policy fuel_methods_read on public.fuel_payment_methods for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists fuel_methods_write on public.fuel_payment_methods;
create policy fuel_methods_write on public.fuel_payment_methods for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.fuel_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  driver_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  truck_id uuid,
  trailer_id uuid,
  trip_id uuid references public.trips(trip_id) on delete set null,
  status text not null default 'fueling' check (status in ('fueling', 'pumping', 'details', 'complete')),
  started_at timestamptz not null default now(),
  pumping_at timestamptz,
  finished_at timestamptz,
  completed_at timestamptz,
  odometer numeric,
  products text check (products in ('diesel', 'diesel_def')),
  pay_kind text check (pay_kind in ('rfid', 'company_account', 'fuel_card', 'personal_card', 'cash')),
  method_id uuid references public.fuel_payment_methods(id) on delete set null,
  pump_number text,
  attempts jsonb not null default '[]',
  diesel_gallons numeric,
  def_gallons numeric,
  filled_to_full boolean,
  store_name text,
  store_number text,
  address text,
  city text,
  state text,
  lat double precision,
  lon double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fuel_purchases_truck on public.fuel_purchases(truck_id, started_at desc);
create index if not exists fuel_purchases_driver on public.fuel_purchases(driver_id, started_at desc);
create index if not exists fuel_purchases_company on public.fuel_purchases(company_id, started_at desc);

alter table public.fuel_purchases enable row level security;
drop policy if exists fuel_purchases_read on public.fuel_purchases;
create policy fuel_purchases_read on public.fuel_purchases for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists fuel_purchases_insert on public.fuel_purchases;
create policy fuel_purchases_insert on public.fuel_purchases for insert to authenticated
  with check (driver_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists fuel_purchases_update on public.fuel_purchases;
create policy fuel_purchases_update on public.fuel_purchases for update to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id))
  with check (driver_id = auth.uid() or public.is_company_admin(company_id));
drop policy if exists fuel_purchases_delete on public.fuel_purchases;
create policy fuel_purchases_delete on public.fuel_purchases for delete to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id));

create table if not exists public.fuel_purchase_payments (
  purchase_id uuid primary key references public.fuel_purchases(id) on delete cascade,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  driver_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  is_personal boolean not null default false,
  price_per_gallon numeric,
  diesel_amount numeric,
  def_amount numeric,
  total_amount numeric,
  vault_entry_id uuid references public.vault_entries(id) on delete set null,
  receipt_path text,
  updated_at timestamptz not null default now()
);

alter table public.fuel_purchase_payments enable row level security;
drop policy if exists fuel_payments_read on public.fuel_purchase_payments;
create policy fuel_payments_read on public.fuel_purchase_payments for select to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id)
         or (not is_personal and public.is_company_member(company_id)));
drop policy if exists fuel_payments_insert on public.fuel_purchase_payments;
create policy fuel_payments_insert on public.fuel_purchase_payments for insert to authenticated
  with check (driver_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists fuel_payments_update on public.fuel_purchase_payments;
create policy fuel_payments_update on public.fuel_purchase_payments for update to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id))
  with check (driver_id = auth.uid() or public.is_company_admin(company_id));
drop policy if exists fuel_payments_delete on public.fuel_purchase_payments;
create policy fuel_payments_delete on public.fuel_purchase_payments for delete to authenticated
  using (driver_id = auth.uid() or public.is_company_admin(company_id));

-- Receipts bucket. Driver writes into their own folder; reads: the driver,
-- company admins, and (company-paid only) company staff.
insert into storage.buckets (id, name, public)
values ('fuel-receipts', 'fuel-receipts', false)
on conflict (id) do nothing;

drop policy if exists "fuel receipts upload own" on storage.objects;
create policy "fuel receipts upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fuel-receipts'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_company_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "fuel receipts read" on storage.objects;
create policy "fuel receipts read" on storage.objects for select to authenticated
  using (
    bucket_id = 'fuel-receipts'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_company_admin(((storage.foldername(name))[1])::uuid)
      or ((storage.foldername(name))[3] = 'company'
          and public.is_company_staff(((storage.foldername(name))[1])::uuid))
    )
  );
drop policy if exists "fuel receipts delete own" on storage.objects;
create policy "fuel receipts delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'fuel-receipts' and (storage.foldername(name))[2] = auth.uid()::text);
