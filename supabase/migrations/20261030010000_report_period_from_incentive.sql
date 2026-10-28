-- Reports now share company_report_period. Carry over periods companies already set on incentive_settings.
insert into public.company_report_period (company_id, period_type, anchor_date)
select i.company_id, coalesce(i.pay_period_type, 'biweekly'), i.pay_period_anchor_date
from public.incentive_settings i
where i.pay_period_anchor_date is not null
on conflict (company_id) do nothing;
