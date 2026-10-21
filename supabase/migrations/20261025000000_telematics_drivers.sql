-- Links the provider's drivers (Geotab users) to ProTankr members, for hours of
-- service. Server-only, like the vehicle map: RLS on, no policies.
create table if not exists public.telematics_driver_map (
  company_id uuid not null,
  provider_user_id text not null,
  user_id uuid not null,
  driver_name text,
  matched_by text not null default 'name',
  primary key (company_id, provider_user_id),
  unique (company_id, user_id)
);
alter table public.telematics_driver_map enable row level security;
