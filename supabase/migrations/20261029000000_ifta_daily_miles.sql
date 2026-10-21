-- Miles per truck per day per state, from the truck's GPS trail scaled to its
-- odometer (lib/ifta). Filled once a day by /api/cron/ifta. Staff of the
-- company read it for the IFTA report; only the server writes.
create table if not exists public.ifta_daily_miles (
  company_id uuid not null,
  truck_id uuid not null,
  day date not null,
  state text not null,            -- 2-letter code, OUT (outside the 50 states), or NONE (a day with no movement)
  miles numeric not null default 0,
  source text not null default 'geotab',
  computed_at timestamptz not null default now(),
  primary key (company_id, truck_id, day, state)
);
create index if not exists ifta_daily_miles_company_day on public.ifta_daily_miles (company_id, day);
alter table public.ifta_daily_miles enable row level security;
drop policy if exists ifta_daily_miles_staff_read on public.ifta_daily_miles;
create policy ifta_daily_miles_staff_read on public.ifta_daily_miles for select
  using (exists (select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = ifta_daily_miles.company_id and uc.role in ('admin','owner','dispatch','lead')));
