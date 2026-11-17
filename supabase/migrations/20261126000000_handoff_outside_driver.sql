-- A driver the tracker shows in a truck who has no ProTankr account: kept by name so the board can show their initials.
alter table public.equipment_handoffs alter column user_id drop not null;
alter table public.equipment_handoffs add column if not exists external_name text;
alter table public.equipment_handoffs add column if not exists external_provider_id text;
