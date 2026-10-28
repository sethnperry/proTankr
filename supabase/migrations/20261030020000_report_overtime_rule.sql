-- Which overtime rule the Work Log uses to split regular and overtime hours (an estimate for records).
alter table public.company_report_period add column if not exists overtime_rule text not null default 'federal'
  check (overtime_rule in ('federal','daily8','colorado','california'));
