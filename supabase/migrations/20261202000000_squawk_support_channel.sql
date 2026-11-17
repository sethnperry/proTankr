-- The "Seth" channel: a comment line from every user to ProTankr. One thread per user (channel key = that user's id).
-- The user sees their own thread; a ProTankr admin (super admin) sees every thread and replies as "SP - ProTankr".
-- How long these messages are kept is a setting (platform_settings 'squawk_support': amount + unit, or never).
-- A ProTankr admin can also post to any company's channel without being a member of it.

alter table public.squawk_messages drop constraint if exists squawk_messages_channel_type_check;
alter table public.squawk_messages add constraint squawk_messages_channel_type_check
  check (channel_type in ('city_network','city_internal','company','region','local_area','to_rack','to_drop','truck','trailer','support'));

-- Keep time for support messages. null = never expires.
create or replace function public._support_ttl() returns interval
language plpgsql stable security definer set search_path = public as $$
declare v jsonb; n int; u text;
begin
  select value into v from public.platform_settings where key = 'squawk_support';
  u := coalesce(v->>'unit', 'days');
  if u = 'never' then return null; end if;
  n := greatest(1, coalesce((v->>'amount')::int, 30));
  return case u when 'hours' then make_interval(hours => n) when 'weeks' then make_interval(days => n * 7) when 'months' then make_interval(days => n * 30) else make_interval(days => n) end;
end $$;
grant execute on function public._support_ttl() to authenticated;

create or replace function public._is_super(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.super_admins where user_id = p_user) $$;
revoke all on function public._is_super(uuid) from public, anon, authenticated;

-- squawk_member: a support thread belongs to its owner and to ProTankr admins.
create or replace function public.squawk_member(p_type text, p_key text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_co uuid; v_region text; v_area text; v_target uuid;
begin
  if p_user is null then return false; end if;
  parts := string_to_array(p_key, '|');
  if p_type = 'support' then
    return p_user::text = p_key or public._is_super(p_user);
  elsif p_type = 'city_network' then
    return exists (select 1 from public.user_companies where user_id = p_user);
  elsif p_type = 'to_rack' then
    begin v_target := p_key::uuid; exception when others then return false; end;
    return exists (select 1 from public.trips t join public.trip_pickups k on k.trip_id = t.trip_id
      where t.driver_id = p_user and t.status in ('draft','loading','in_transit','delivering')
        and k.terminal_id = v_target and k.left_at is null and coalesce(k.outcome, '') <> 'no_load');
  elsif p_type = 'to_drop' then
    return exists (select 1 from public.trips t join public.trip_deliveries d on d.trip_id = t.trip_id
      where t.driver_id = p_user and t.status in ('draft','loading','in_transit','delivering')
        and d.status = 'planned' and public._site_key(d.location_id) = p_key);
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

create or replace function public.squawk_visible(m public.squawk_messages) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v timestamptz; ttl interval;
begin
  if m.retracted_at is not null then return false; end if;
  if not public.squawk_member(m.channel_type, m.channel_key) then return false; end if;
  if m.channel_type = 'support' then
    ttl := public._support_ttl();
    return ttl is null or m.created_at + ttl > now();
  end if;
  if m.channel_type in ('local_area','to_rack','to_drop') then
    select viewed_at into v from public.squawk_views where message_id = m.id and user_id = auth.uid();
    if v is not null then return v + make_interval(mins => (cfg->>'view_ttl')::int) > now(); end if;
    return m.created_at + make_interval(mins => (cfg->>'unviewed_cap')::int) > now();
  end if;
  return m.expires_at > now();
end $$;

create or replace function public.squawk_send(p_type text, p_key text, p_body text, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v_id uuid; v_exp timestamptz; v_co uuid; v_body text := trim(coalesce(p_body, '')); v_truck text; v_cn text; v_super boolean := public._is_super(auth.uid());
        v_ini text; v_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- A ProTankr admin may post to any company's channel without being in it.
  if not (public.squawk_member(p_type, p_key) or (v_super and p_type = 'company')) then raise exception 'You are not in that channel.'; end if;
  if v_body = '' and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then raise exception 'Nothing to send.'; end if;
  if length(v_body) > 1000 then raise exception 'Keep it under 1,000 characters.'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then raise exception 'Five attachments at most.'; end if;
  if v_super and p_type = 'company' then
    begin v_co := split_part(p_key, '|', 1)::uuid; exception when others then raise exception 'Pick a company.'; end;
  else
    begin v_co := public.get_active_company_id(); exception when others then v_co := null; end;
  end if;
  v_ini := public._driver_initials(auth.uid());
  select t.truck_name into v_truck from public.user_settings s join public.trucks t on t.truck_id = s.current_truck_id where s.user_id = auth.uid();
  select public._short_company_name(c.company_name) into v_cn from public.companies c where c.company_id = v_co;
  -- ProTankr's own messages read "SP - ProTankr" to everyone, whichever company is looking.
  if v_super and p_type in ('company', 'support') and p_key is distinct from auth.uid()::text then
    v_truck := 'ProTankr'; v_cn := 'ProTankr'; v_label := v_ini || ' - ProTankr';
  else
    v_label := v_ini || ' - ' || coalesce(v_truck, coalesce(v_cn, ''));
  end if;
  v_exp := case when p_type in ('city_network','city_internal','company','region') then now() + make_interval(mins => (cfg->>'feed_age')::int)
                when p_type in ('truck','trailer','support') then 'infinity'::timestamptz
                else now() + make_interval(mins => (cfg->>'unviewed_cap')::int) end;
  insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, sender_initials, sender_truck, sender_company, body, attachments, expires_at)
  values (p_type, p_key, v_co, auth.uid(), v_label, v_ini, v_truck, v_cn, v_body, coalesce(p_attachments, '[]'::jsonb), v_exp) returning id into v_id;
  return v_id;
end $$;

-- The inbox: every support thread with who it is from, the last message and what hasn't been read. ProTankr admins only.
create or replace function public.support_threads() returns table (user_id uuid, user_name text, company_name text, last_body text, last_at timestamptz, last_from_admin boolean, unread bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_super(auth.uid()) then raise exception 'Not authorized'; end if;
  return query
    select t.uid, coalesce(p.display_name, 'Unknown'), coalesce(c.company_name, ''), t.last_body, t.last_at, t.last_from_admin,
           (select count(*) from public.squawk_messages m2
             where m2.channel_type = 'support' and m2.channel_key = t.uid::text and m2.sender_id::text = t.uid::text and m2.retracted_at is null and (public._support_ttl() is null or m2.created_at + public._support_ttl() > now())
               and not exists (select 1 from public.squawk_views v where v.message_id = m2.id and v.user_id = auth.uid()))
      from (select distinct on (m.channel_key) m.channel_key::uuid uid, m.body last_body, m.created_at last_at, m.sender_id::text <> m.channel_key last_from_admin, m.company_id
              from public.squawk_messages m where m.channel_type = 'support' and m.retracted_at is null and (public._support_ttl() is null or m.created_at + public._support_ttl() > now())
             order by m.channel_key, m.created_at desc) t
      left join public.profiles p on p.user_id = t.uid
      left join public.companies c on c.company_id = t.company_id
     order by t.last_at desc;
end $$;
grant execute on function public.support_threads() to authenticated;
