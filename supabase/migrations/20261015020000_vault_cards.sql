-- Card entries in the Vault (2026-10-15).
--
-- Two Vault categories hold cards: 'Company Card' and 'Personal Card'. The
-- fuel screen lists only those as payment options (Company Card tile, My Card
-- tile). Card fields live on the entry itself. Same privacy as every Vault
-- entry: own rows only (existing RLS), never company-visible.

alter table public.vault_entries
  add column if not exists card_name text,
  add column if not exists card_brand text,
  add column if not exists card_number text,
  add column if not exists card_exp text,
  add column if not exists card_pin text;
