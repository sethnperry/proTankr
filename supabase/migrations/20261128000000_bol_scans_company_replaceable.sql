-- A BOL scan belongs to the trip, not to whoever pressed the shutter: anyone in the company can see, replace or
-- remove it (a slip-seat driver, dispatch, the next driver who finishes the trip). Only BOL scans are opened up;
-- other captures (fuel receipts, scale tickets, down time...) keep their own-or-staff rules.
drop policy if exists form_captures_select_bol on public.form_captures;
create policy form_captures_select_bol on public.form_captures for select using (purpose = 'bol' and public.is_company_member(company_id));
drop policy if exists form_captures_update_bol on public.form_captures;
create policy form_captures_update_bol on public.form_captures for update using (purpose = 'bol' and public.is_company_member(company_id)) with check (purpose = 'bol' and public.is_company_member(company_id));

drop policy if exists "form captures read bol" on storage.objects;
create policy "form captures read bol" on storage.objects for select using (
  bucket_id = 'form-captures' and exists (select 1 from public.form_captures c where c.purpose = 'bol' and c.file_paths @> array[storage.objects.name] and public.is_company_member(c.company_id)));
drop policy if exists "form captures delete bol" on storage.objects;
create policy "form captures delete bol" on storage.objects for delete using (
  bucket_id = 'form-captures' and exists (select 1 from public.form_captures c where c.purpose = 'bol' and c.file_paths @> array[storage.objects.name] and public.is_company_member(c.company_id)));
