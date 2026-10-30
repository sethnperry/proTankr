-- A second photo (the back) on badges and credentials. image_path stays the front.
alter table public.driver_port_ids add column if not exists image_back_path text;
alter table public.driver_licenses add column if not exists image_back_path text;
alter table public.driver_medical_cards add column if not exists image_back_path text;
alter table public.driver_twic_cards add column if not exists image_back_path text;
