-- The newest "stopped driving" time already pushed to a driver (see app/api/cron/hos-alerts).
alter table public.hos_alert_state add column if not exists last_stop_at timestamptz;
