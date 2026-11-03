-- Shared cache of recent telematics (Geotab) answers, so phones, the dispatch board and the cron job reuse one
-- call instead of each making their own (Geotab allows ~10 calls a minute per login). Server only: RLS on, no policies.
create table if not exists public.telematics_cache (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (company_id, key)
);
alter table public.telematics_cache enable row level security;
