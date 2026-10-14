-- Long Line and Terminal Issue are about the terminal itself, like Out of
-- Product, so any driver there can clear them once they're over (Driver
-- Dashboard → terminal status). Out of Allocation stays reporter-only: it's
-- company-specific.
drop policy if exists terminal_outage_reports_delete_product_any on terminal_outage_reports;
create policy terminal_outage_reports_delete_product_any on terminal_outage_reports
  for delete using (
    auth.uid() is not null
    and report_type in ('out_of_product', 'long_line', 'terminal_issue')
  );
