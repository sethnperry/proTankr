-- Squawk: radio-style short messages to a channel, with expiry enforced here, not in the app.
-- Channels (channel_type / channel_key):
--   city_network   'tampa|FL'                 any driver, any company, in that terminal city
--   city_internal  '<company>|tampa|FL'       the sender's own company in that city
--   company        '<company>'                everyone in the company
--   region         '<company>|<region>'       drivers whose profile region matches
--   local_area     '<company>|<region>|<area>'  profile region and local area match
--   truck / trailer '<truck id>' / '<trailer id>'  whoever holds that unit now
-- Expiry (settings in platform_settings key 'squawk', minutes; only a ProTankr admin can change them):
--   feed (city_network, city_internal, company, region): view_ttl does not apply; gone feed_age after posting.
--   local_area: per person, view_ttl after that person views it; an unviewed message is gone unviewed_cap after posting.
--   truck, trailer: view_ttl after the first reader other than the sender; unviewed_cap after posting if nobody else reads it.
create table if not exists public.squawk_messages (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null check (channel_type in ('city_network','city_internal','company','region','local_area','truck','trailer')),
  channel_key text not null,
  company_id uuid,
  sender_id uuid not null,
  sender_label text not null default '',
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  first_other_view_at timestamptz
);
create index if not exists squawk_messages_channel on public.squawk_messages (channel_type, channel_key, created_at);
create index if not exists squawk_messages_expiry on public.squawk_messages (expires_at);
create table if not exists public.squawk_views (
  message_id uuid not null references public.squawk_messages(id) on delete cascade,
  user_id uuid not null,
  viewed_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.squawk_messages enable row level security;
alter table public.squawk_views enable row level security;
create policy squawk_views_own on public.squawk_views for select using (user_id = auth.uid());

create or replace function public.squawk_cfg() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'view_ttl', coalesce((value->>'view_ttl_min')::int, 60),
    'unviewed_cap', coalesce((value->>'unviewed_cap_min')::int, 240),
    'feed_age', coalesce((value->>'feed_age_min')::int, 240))
  from (select coalesce((select value from public.platform_settings where key = 'squawk'), '{}'::jsonb) value) s
$$;

-- Is the signed-in user in this channel right now?
create or replace function public.squawk_member(p_type text, p_key text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_co uuid; v_region text; v_area text;
begin
  if p_user is null then return false; end if;
  parts := string_to_array(p_key, '|');
  if p_type = 'city_network' then
    return exists (select 1 from public.user_companies where user_id = p_user);
  elsif p_type in ('city_internal','company','region','local_area') then
    begin v_co := parts[1]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.user_companies where user_id = p_user and company_id = v_co) then return false; end if;
    if p_type in ('city_internal','company') then return true; end if;
    select lower(trim(coalesce(region, ''))), lower(trim(coalesce(local_area, ''))) into v_region, v_area from public.profiles where user_id = p_user;
    if p_type = 'region' then return v_region <> '' and v_region = lower(trim(coalesce(parts[2], ''))); end if;
    return v_region <> '' and v_area <> '' and v_region = lower(trim(coalesce(parts[2], ''))) and v_area = lower(trim(coalesce(parts[3], '')));
  elsif p_type = 'truck' then
    return exists (select 1 from public.user_settings where user_id = p_user and current_truck_id::text = p_key);
  elsif p_type = 'trailer' then
    return exists (select 1 from public.user_settings where user_id = p_user and current_trailer_id::text = p_key);
  end if;
  return false;
end $$;

-- May this user see this message now? (membership and expiry)
create or replace function public.squawk_visible(m public.squawk_messages) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v timestamptz;
begin
  if not public.squawk_member(m.channel_type, m.channel_key) then return false; end if;
  if m.channel_type = 'local_area' then
    select viewed_at into v from public.squawk_views where message_id = m.id and user_id = auth.uid();
    if v is not null then return v + make_interval(mins => (cfg->>'view_ttl')::int) > now(); end if;
    return m.created_at + make_interval(mins => (cfg->>'unviewed_cap')::int) > now();
  end if;
  return m.expires_at > now();
end $$;

create policy squawk_messages_read on public.squawk_messages for select using (public.squawk_visible(squawk_messages));

create or replace function public.squawk_send(p_type text, p_key text, p_body text, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v_id uuid; v_label text; v_exp timestamptz; v_co uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.squawk_member(p_type, p_key) then raise exception 'You are not in that channel.'; end if;
  if v_body = '' and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then raise exception 'Nothing to send.'; end if;
  if length(v_body) > 1000 then raise exception 'Keep it under 1,000 characters.'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then raise exception 'Five attachments at most.'; end if;
  select coalesce(t.truck_name, '') into v_label from public.user_settings s left join public.trucks t on t.truck_id = s.current_truck_id where s.user_id = auth.uid();
  if coalesce(v_label, '') = '' then v_label := 'Driver'; end if;
  begin v_co := public.get_active_company_id(); exception when others then v_co := null; end;
  v_exp := case when p_type in ('city_network','city_internal','company','region') then now() + make_interval(mins => (cfg->>'feed_age')::int)
                else now() + make_interval(mins => (cfg->>'unviewed_cap')::int) end;
  insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, body, attachments, expires_at)
  values (p_type, p_key, v_co, auth.uid(), v_label, v_body, coalesce(p_attachments, '[]'::jsonb), v_exp) returning id into v_id;
  return v_id;
end $$;

-- The reader saw these. Starts the clock (per person, or the first other reader on a truck or trailer).
create or replace function public.squawk_mark_viewed(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); m public.squawk_messages;
begin
  if auth.uid() is null then return; end if;
  for m in select * from public.squawk_messages where id = any(p_ids) loop
    if not public.squawk_visible(m) then continue; end if;
    insert into public.squawk_views (message_id, user_id) values (m.id, auth.uid()) on conflict do nothing;
    if m.channel_type in ('truck','trailer') and m.sender_id <> auth.uid() and m.first_other_view_at is null then
      update public.squawk_messages set first_other_view_at = now(), expires_at = least(expires_at, now() + make_interval(mins => (cfg->>'view_ttl')::int)) where id = m.id;
    end if;
  end loop;
end $$;

-- How many new messages are waiting, by channel, for the dashboard alert.
create or replace function public.squawk_unread() returns table (channel_type text, channel_key text, n bigint)
language sql stable security definer set search_path = public as $$
  select m.channel_type, m.channel_key, count(*)
    from public.squawk_messages m
   where public.squawk_visible(m) and m.sender_id <> auth.uid()
     and not exists (select 1 from public.squawk_views v where v.message_id = m.id and v.user_id = auth.uid())
   group by 1, 2
$$;

grant execute on function public.squawk_cfg(), public.squawk_send(text, text, text, jsonb), public.squawk_mark_viewed(uuid[]), public.squawk_unread() to authenticated;
grant execute on function public.squawk_member(text, text, uuid) to authenticated;

insert into public.platform_settings (key, value) values ('squawk', '{"view_ttl_min":60,"unviewed_cap_min":240,"feed_age_min":240}'::jsonb) on conflict (key) do nothing;

-- Attachments: a private bucket. A user uploads under their own folder; they can read a file only while a message they
-- can see names it.
insert into storage.buckets (id, name, public) values ('squawk', 'squawk', false) on conflict (id) do nothing;
create policy squawk_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'squawk' and (storage.foldername(name))[1] = auth.uid()::text);
create policy squawk_files_read on storage.objects for select to authenticated
  using (bucket_id = 'squawk' and exists (select 1 from public.squawk_messages m where m.attachments @> jsonb_build_array(jsonb_build_object('path', name))));

alter publication supabase_realtime add table public.squawk_messages;
