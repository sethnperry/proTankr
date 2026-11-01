-- Rack Down: a terminal-wide report (like Long Line), shown to every driver headed there.
alter table public.terminal_outage_reports drop constraint if exists terminal_outage_reports_report_type_check;
alter table public.terminal_outage_reports
  add constraint terminal_outage_reports_report_type_check
  check (report_type in ('out_of_product', 'out_of_allocation', 'long_line', 'terminal_issue', 'rack_down'));

-- Any driver can clear it once the rack is back (same as Long Line and Terminal Issue).
drop policy if exists terminal_outage_reports_delete_product_any on public.terminal_outage_reports;
create policy terminal_outage_reports_delete_product_any on public.terminal_outage_reports
  for delete using (
    auth.uid() is not null
    and report_type in ('out_of_product', 'long_line', 'terminal_issue', 'rack_down')
  );
