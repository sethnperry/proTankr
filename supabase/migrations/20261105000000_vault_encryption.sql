-- Vault end-to-end encryption. The vault key is made on the phone and stored only wrapped: once by a key
-- derived from the driver's passphrase, once by a recovery code. The server can't open either.
-- Sensitive entry fields move into vault_entries.enc (ciphertext); label, category, card brand, card expiry
-- and the last digits stay readable so the grid, the fuel card list and the Expirations chip keep working.
create table if not exists public.vault_keys (
  user_id uuid primary key default auth.uid(),
  kdf jsonb not null,
  wrapped_passphrase text not null,
  wrapped_recovery text not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vault_keys enable row level security;
drop policy if exists vault_keys_select_own on public.vault_keys;
create policy vault_keys_select_own on public.vault_keys for select to authenticated using (user_id = auth.uid());
drop policy if exists vault_keys_insert_own on public.vault_keys;
create policy vault_keys_insert_own on public.vault_keys for insert to authenticated with check (user_id = auth.uid());
drop policy if exists vault_keys_update_own on public.vault_keys;
create policy vault_keys_update_own on public.vault_keys for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists vault_keys_delete_own on public.vault_keys;
create policy vault_keys_delete_own on public.vault_keys for delete to authenticated using (user_id = auth.uid());

alter table public.vault_entries add column if not exists enc text;
alter table public.vault_entries add column if not exists card_last4 text;
