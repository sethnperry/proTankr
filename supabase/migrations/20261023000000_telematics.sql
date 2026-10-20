-- Telematics connector (Geotab first). One connection per company, set up once
-- by an admin. Credentials are stored encrypted by the server; these tables
-- have RLS on and no policies, so only the service role (our API routes) can
-- touch them.
create table if not exists public.telematics_connections (
  company_id uuid primary key,
  provider text not null default 'geotab',
  database_name text not null,
  user_name text not null,
  credentials_enc text not null,
  status text not null default 'active',
  last_error text,
  last_ok_at timestamptz,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telematics_vehicle_map (
  company_id uuid not null,
  provider_vehicle_id text not null,
  truck_id uuid not null,
  vehicle_name text,
  vin text,
  matched_by text not null default 'name',
  primary key (company_id, provider_vehicle_id),
  unique (company_id, truck_id)
);

alter table public.telematics_connections enable row level security;
alter table public.telematics_vehicle_map enable row level security;
