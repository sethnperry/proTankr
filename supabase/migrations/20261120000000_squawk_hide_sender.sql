-- Nobody but the server needs to know which account sent a Squawk message. The label (initials - truck/company)
-- is what people see; "is this mine" comes from squawk_mine().
revoke select on public.squawk_messages from anon, authenticated;
grant select (id, channel_type, channel_key, company_id, sender_label, sender_initials, sender_truck, sender_company,
              body, attachments, created_at, expires_at, retracted_at)
  on public.squawk_messages to authenticated;

create or replace function public.squawk_mine(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.squawk_messages where id = any(p_ids) and sender_id = auth.uid()
$$;
grant execute on function public.squawk_mine(uuid[]) to authenticated;
