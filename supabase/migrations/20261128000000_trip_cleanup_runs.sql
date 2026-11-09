-- One row per company per week for the Monday cancelled-loads report and cleanup, so a repeated
-- tick never sends it twice. Written by the server only (RLS on, no policies).
create table if not exists public.trip_cleanup_runs (
  company_id uuid not null references public.companies(company_id) on delete cascade,
  week_start date not null,
  ran_at timestamptz not null default now(),
  reported integer not null default 0,
  deleted integer not null default 0,
  primary key (company_id, week_start)
);
alter table public.trip_cleanup_runs enable row level security;
