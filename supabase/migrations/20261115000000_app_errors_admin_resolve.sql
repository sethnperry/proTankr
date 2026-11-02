-- The Desk: only a company admin (or a super admin) resolves an error entry. Dispatch can read their region's
-- entries but not change them; drivers only ever write their own.
drop policy if exists app_errors_update on public.app_errors;
create policy app_errors_update on public.app_errors for update
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
