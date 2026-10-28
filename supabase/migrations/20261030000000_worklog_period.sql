-- Work Log report: the company's report period (set by an admin) and a driver's email opt-out.
-- A driver's own period override reuses driver_pay_settings.pay_period_type / pay_period_anchor_date.
create table if not exists public.company_report_period (
  company_id uuid primary key references public.companies(company_id) on delete cascade,
  period_type text not null default 'weekly' check (period_type in ('weekly','biweekly','semi_monthly','monthly')),
  anchor_date date not null default date '2026-01-07',
  send_after_days int not null default 2 check (send_after_days between 0 and 14),
  tz text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);
alter table public.company_report_period enable row level security;

drop policy if exists company_report_period_read on public.company_report_period;
create policy company_report_period_read on public.company_report_period
  for select using (exists (select 1 from public.user_companies uc where uc.company_id = company_report_period.company_id and uc.user_id = auth.uid()));

drop policy if exists company_report_period_write on public.company_report_period;
create policy company_report_period_write on public.company_report_period
  for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

alter table public.driver_pay_settings add column if not exists worklog_email boolean not null default true;
alter table public.driver_pay_settings add column if not exists pay_period_anchor_date date;
