-- Drivers could READ their own license, medical card, port ID and TWIC rows but not write them: the xx_own
-- policies were SELECT-only, and the only write paths were company admin/dispatch. A regular driver who typed
-- their license or medical expiry got an RLS error (insert) or a silent zero-row update, so it never saved.
-- Adds own-row write policies, scoped to the driver's own user_id and a company they belong to.

do $$
declare t text; p text;
begin
  foreach t in array array['driver_licenses','driver_medical_cards','driver_port_ids','driver_twic_cards'] loop
    p := case t when 'driver_licenses' then 'dl' when 'driver_medical_cards' then 'dmc' when 'driver_port_ids' then 'dpid' else 'dtc' end;
    execute format('drop policy if exists %I on public.%I', p || '_own_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = %I.company_id))', p || '_own_insert', t, t);
    execute format('drop policy if exists %I on public.%I', p || '_own_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', p || '_own_update', t);
    execute format('drop policy if exists %I on public.%I', p || '_own_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())', p || '_own_delete', t);
  end loop;
end $$;
