-- A driver's own telematics (Geotab) login, so their hours of service come from their own account instead of
-- whatever the company admin's login can see. The database name comes from the company connection; the
-- password is stored encrypted by the server. RLS on, no policies: only the service role (our API) touches it.
create table if not exists public.telematics_driver_credentials (
  company_id uuid not null,
  user_id uuid not null,
  user_name text not null,
  credentials_enc text not null,
  provider_user_id text,
  status text not null default 'active',
  last_error text,
  last_ok_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
alter table public.telematics_driver_credentials enable row level security;
