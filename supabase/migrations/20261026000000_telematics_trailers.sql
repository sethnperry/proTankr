-- Links the provider's trailers to the company's trailers, for hookup
-- detection. Server-only like the other maps: RLS on, no policies.
create table if not exists public.telematics_trailer_map (
  company_id uuid not null,
  provider_trailer_id text not null,
  trailer_id uuid not null,
  trailer_name text,
  matched_by text not null default 'name',
  primary key (company_id, provider_trailer_id),
  unique (company_id, trailer_id)
);
alter table public.telematics_trailer_map enable row level security;
