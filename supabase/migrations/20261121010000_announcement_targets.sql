-- Announcements can be aimed: specific companies and/or specific roles (null = everyone). Matching is done on one
-- membership row, so "company A + drivers" means a driver of A, not "someone in A who is a driver somewhere else".
alter table public.admin_announcements
  add column if not exists target_company_ids uuid[],
  add column if not exists target_roles text[];

-- People no longer read the table directly; they ask for what is meant for them.
drop policy if exists announcements_read on public.admin_announcements;
create policy announcements_read on public.admin_announcements for select to authenticated using (public.is_super_admin());

create or replace function public.my_announcements()
returns table (id uuid, subject text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.subject, a.body, a.created_at
    from public.admin_announcements a
   where a.active
     and not exists (select 1 from public.announcement_dismissals d where d.announcement_id = a.id and d.user_id = auth.uid())
     and (
       (a.target_company_ids is null and a.target_roles is null)
       or exists (
         select 1 from public.user_companies m
          where m.user_id = auth.uid()
            and (a.target_company_ids is null or m.company_id = any(a.target_company_ids))
            and (a.target_roles is null or (case when m.role = 'owner' then 'admin' else m.role end) = any(a.target_roles))
       )
     )
   order by a.created_at desc
   limit 20
$$;
grant execute on function public.my_announcements() to authenticated;
