-- Driver recap email: the driver's pay period (private, self-only, in driver_pay_settings) and what
-- the server has already sent.
alter table public.driver_pay_settings add column if not exists pay_period_anchor_date date;

create table if not exists public.driver_recap_state (
  user_id uuid primary key,
  company_id uuid,
  last_restart_key timestamptz,   -- start of the off-duty stretch that triggered the last send
  last_period_end date,           -- end of the last pay period recapped
  intro_sent_at timestamptz,      -- the "set your pay period" note
  updated_at timestamptz not null default now()
);
alter table public.driver_recap_state enable row level security;

alter table public.driver_recap_state add column if not exists checked_at timestamptz;
