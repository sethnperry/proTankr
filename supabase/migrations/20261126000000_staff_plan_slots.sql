-- Dispatch builds and picks a driver's saved plans (user_plan_slots) from the Plan Trip window,
-- the same slots the driver sees as plans A-E. Until now only the owner could read or write them.
-- Staff (owner, admin, dispatch) get read and write on slots of drivers in their own company.
-- Existing own-row policies are untouched; permissive policies OR together.

create or replace function public.is_staff_of_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.user_companies me
    join public.user_companies them on them.company_id = me.company_id
    where me.user_id = auth.uid()
      and me.role in ('owner', 'admin', 'dispatch')
      and them.user_id = p_user_id
  );
$$;

grant execute on function public.is_staff_of_user(uuid) to authenticated;

create policy user_plan_slots_staff_read on public.user_plan_slots
  for select to authenticated
  using (public.is_staff_of_user(user_id));

create policy user_plan_slots_staff_insert on public.user_plan_slots
  for insert to authenticated
  with check (public.is_staff_of_user(user_id));

create policy user_plan_slots_staff_update on public.user_plan_slots
  for update to authenticated
  using (public.is_staff_of_user(user_id))
  with check (public.is_staff_of_user(user_id));
