-- Squawk, second pass:
--  * sender label is the driver's initials and truck number ("SP 25184"); on the city network it is the company's short
--    name and the driver's initials ("Gemini SP"), since outside drivers see it
--  * truck and trailer messages never expire on their own: only a reader other than the sender starts the clock, or the
--    sender retracts the message
--  * two more channels, to_rack and to_drop, treated like local areas (per person): drivers of the company whose open
--    trip is headed to the same terminal (key '<company>|<terminal id>') or the same delivery location
--    (key '<company>|<location id>')
alter table public.squawk_messages add column if not exists retracted_at timestamptz;
alter table public.squawk_messages drop constraint if exists squawk_messages_channel_type_check;
alter table public.squawk_messages add constraint squawk_messages_channel_type_check
  check (channel_type in ('city_network','city_internal','company','region','local_area','to_rack','to_drop','truck','trailer'));

create or replace function public.squawk_member(p_type text, p_key text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_co uuid; v_region text; v_area text; v_target uuid;
begin
  if p_user is null then return false; end if;
  parts := string_to_array(p_key, '|');
  if p_type = 'city_network' then
    return exists (select 1 from public.user_companies where user_id = p_user);
  elsif p_type in ('city_internal','company','region','local_area','to_rack','to_drop') then
    begin v_co := parts[1]::uuid; exception when others then return false; end;
    if not exists (select 1 from public.user_companies where user_id = p_user and company_id = v_co) then return false; end if;
    if p_type in ('city_internal','company') then return true; end if;
    if p_type in ('to_rack','to_drop') then
      begin v_target := parts[2]::uuid; exception when others then return false; end;
      if p_type = 'to_rack' then
        return exists (select 1 from public.trips t join public.trip_pickups k on k.trip_id = t.trip_id
          where t.driver_id = p_user and t.company_id = v_co and t.status in ('draft','loading','in_transit','delivering')
            and k.terminal_id = v_target and k.left_at is null and coalesce(k.outcome, '') <> 'no_load');
      end if;
      return exists (select 1 from public.trips t join public.trip_deliveries d on d.trip_id = t.trip_id
        where t.driver_id = p_user and t.company_id = v_co and t.status in ('draft','loading','in_transit','delivering')
          and d.location_id = v_target and d.status = 'planned');
    end if;
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
declare cfg jsonb := public.squawk_cfg(); v timestamptz;
begin
  if m.retracted_at is not null then return false; end if;
  if not public.squawk_member(m.channel_type, m.channel_key) then return false; end if;
  if m.channel_type in ('local_area','to_rack','to_drop') then
    select viewed_at into v from public.squawk_views where message_id = m.id and user_id = auth.uid();
    if v is not null then return v + make_interval(mins => (cfg->>'view_ttl')::int) > now(); end if;
    return m.created_at + make_interval(mins => (cfg->>'unviewed_cap')::int) > now();
  end if;
  return m.expires_at > now();
end $$;

create or replace function public._squawk_label(p_type text, p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_name text; v_ini text; v_truck text; v_co text;
begin
  select display_name into v_name from public.profiles where user_id = p_user;
  select coalesce(string_agg(upper(left(w, 1)), '' order by ord), '') into v_ini
    from unnest(regexp_split_to_array(trim(coalesce(v_name, '')), '\s+')) with ordinality as t(w, ord) where w <> '' and ord <= 3;
  if v_ini = '' then v_ini := 'DR'; end if;
  if p_type = 'city_network' then
    select _short_company_name(c.company_name) into v_co from public.companies c where c.company_id = public.get_active_company_id();
    return trim(coalesce(v_co, '') || ' ' || v_ini);
  end if;
  select t.truck_name into v_truck from public.user_settings s join public.trucks t on t.truck_id = s.current_truck_id where s.user_id = p_user;
  return trim(v_ini || ' ' || coalesce(v_truck, ''));
end $$;
revoke all on function public._squawk_label(text, uuid) from public, anon, authenticated;

create or replace function public.squawk_send(p_type text, p_key text, p_body text, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v_id uuid; v_exp timestamptz; v_co uuid; v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.squawk_member(p_type, p_key) then raise exception 'You are not in that channel.'; end if;
  if v_body = '' and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then raise exception 'Nothing to send.'; end if;
  if length(v_body) > 1000 then raise exception 'Keep it under 1,000 characters.'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then raise exception 'Five attachments at most.'; end if;
  begin v_co := public.get_active_company_id(); exception when others then v_co := null; end;
  v_exp := case when p_type in ('city_network','city_internal','company','region') then now() + make_interval(mins => (cfg->>'feed_age')::int)
                when p_type in ('truck','trailer') then 'infinity'::timestamptz  -- until another reader views it, or the sender retracts it
                else now() + make_interval(mins => (cfg->>'unviewed_cap')::int) end;
  insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, body, attachments, expires_at)
  values (p_type, p_key, v_co, auth.uid(), public._squawk_label(p_type, auth.uid()), v_body, coalesce(p_attachments, '[]'::jsonb), v_exp) returning id into v_id;
  return v_id;
end $$;

create or replace function public.squawk_mark_viewed(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); m public.squawk_messages;
begin
  if auth.uid() is null then return; end if;
  for m in select * from public.squawk_messages where id = any(p_ids) loop
    if not public.squawk_visible(m) then continue; end if;
    insert into public.squawk_views (message_id, user_id) values (m.id, auth.uid()) on conflict do nothing;
    if m.channel_type in ('truck','trailer') and m.sender_id <> auth.uid() and m.first_other_view_at is null then
      update public.squawk_messages set first_other_view_at = now(), expires_at = now() + make_interval(mins => (cfg->>'view_ttl')::int) where id = m.id;
    end if;
  end loop;
end $$;

-- The sender takes a message back; it disappears for everyone at once and its files are deleted on the next tick.
create or replace function public.squawk_retract(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.squawk_messages set retracted_at = now() where id = p_id and sender_id = auth.uid() and retracted_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;
grant execute on function public.squawk_retract(uuid) to authenticated;
