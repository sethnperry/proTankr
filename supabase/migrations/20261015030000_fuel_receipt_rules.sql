-- Separate receipt rules for company cards and out-of-pocket (2026-10-15).
-- Both default to required. The old single require_receipt column is no
-- longer read (RFID / company account never ask for a receipt).

alter table public.fuel_settings
  add column if not exists require_receipt_company_card boolean not null default true,
  add column if not exists require_receipt_personal boolean not null default true;
