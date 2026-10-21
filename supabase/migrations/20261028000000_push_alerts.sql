-- Web push for hours-of-service alerts. A member's devices that opted in, and
-- what has already been announced so a cron run never repeats an alert.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null,
  company_id uuid not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_company on public.push_subscriptions (company_id, user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.hos_alert_state (
  company_id uuid not null,
  user_id uuid not null,
  trip_level text not null default 'ok',
  low_level text not null default 'none',
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
alter table public.hos_alert_state enable row level security; -- server only
