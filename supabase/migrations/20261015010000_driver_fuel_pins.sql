-- Driver PINs for RFID / company-account fuel methods (2026-10-15).
--
-- The pump asks for a driver PIN on programs like Love's QuickQ. The driver
-- enters it the first time they use that method; it's shown on the pump
-- screen after that. One row per driver per method. Only the driver can read
-- or change it, not company admins or staff. Card numbers are still never
-- stored anywhere.

create table if not exists public.driver_fuel_pins (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  method_id uuid not null references public.fuel_payment_methods(id) on delete cascade,
  pin text not null check (length(pin) between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, method_id)
);

alter table public.driver_fuel_pins enable row level security;
drop policy if exists driver_fuel_pins_own on public.driver_fuel_pins;
create policy driver_fuel_pins_own on public.driver_fuel_pins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
