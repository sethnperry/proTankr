-- Short-lived cache of a company's recent shipment numbers from the telematics provider.
-- One provider call serves every truck in the company for ~25 s, across all server instances, and a
-- "quota exceeded" answer pauses calls for a minute instead of being retried. Server-only: RLS on,
-- no policies (only the service role reads or writes it).
create table if not exists public.telematics_shipment_cache (
  company_id    uuid primary key references public.companies(company_id) on delete cascade,
  fetched_at    timestamptz not null default now(),
  blocked_until timestamptz,
  rows          jsonb not null default '[]'::jsonb
);
alter table public.telematics_shipment_cache enable row level security;
