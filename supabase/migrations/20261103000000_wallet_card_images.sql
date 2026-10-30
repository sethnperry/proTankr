-- Optional photo of a badge or credential, shown on the card instead of initials. Files live in the
-- equipment-docs bucket under {company_id}/wallet/{user_id}/.
alter table public.driver_port_ids add column if not exists image_path text;
alter table public.driver_licenses add column if not exists image_path text;
alter table public.driver_medical_cards add column if not exists image_path text;
alter table public.driver_twic_cards add column if not exists image_path text;
