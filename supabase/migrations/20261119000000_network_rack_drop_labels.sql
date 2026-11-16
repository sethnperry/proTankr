-- Network-wide To rack / To drop, and one naming rule everywhere a truck is listed: the driver's initials, a dash, then
-- the truck number for our own company's trucks, or the short company name for another company's.
create or replace function public._driver_initials(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select string_agg(upper(left(w, 1)), '' order by ord)
    from unnest(regexp_split_to_array(trim(coalesce((select display_name from public.profiles where user_id = p_user), '')), '\s+')) with ordinality as t(w, ord)
   where w <> '' and ord <= 3), ''), 'DR')
$$;
revoke all on function public._driver_initials(uuid) from public, anon;
grant execute on function public._driver_initials(uuid) to authenticated;

-- One name for a store across companies: state, name, store number and city, normalised the way site notes are.
create or replace function public._site_key(p_location_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select upper(coalesce(l.state, '')) || '~' || coalesce(_norm_store_text(l.name), '') || '~' || coalesce(_norm_store_text(l.location_number), '') || '~' || coalesce(_norm_store_city(l.city), '')
    from public.delivery_locations l where l.location_id = p_location_id
$$;
revoke all on function public._site_key(uuid) from public, anon, authenticated;
create or replace function public.squawk_site_key(p_location_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_co uuid;
begin
  select company_id into v_co from public.delivery_locations where location_id = p_location_id;
  if v_co is null or not trip_company_member(v_co) then return null; end if;
  return public._site_key(p_location_id);
end $$;
grant execute on function public.squawk_site_key(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.other_carriers_to_terminal(p_terminal_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'trip_id', x.trip_id,
      'who', _short_company_name((select c.company_name from companies c where c.company_id = x.company_id)),
      'initials', _driver_initials(x.driver_id),
      'arrived', x.arrived_at is not null,
      'arrived_at', x.arrived_at,
      'comps', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', (e->>'comp_number')::int, 'product_id', e->>'product_id', 'gallons', 0))
          from jsonb_array_elements(coalesce(x.planned_comps, '[]'::jsonb)) e
         where e->>'product_id' is not null), '[]'::jsonb),
      -- The trailer's compartments and what each last held since its last wash, so the strip can show residue.
      'sizes', coalesce((select jsonb_agg(jsonb_build_object('comp_number', tc.comp_number, 'size', tc.max_gallons) order by tc.comp_number)
                           from trailer_compartments tc where tc.trailer_id = x.trailer_id), '[]'::jsonb),
      'residue', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', r.comp_number, 'product_id', r.product_id))
          from (
            select distinct on (ll.comp_number) ll.comp_number, ll.product_id
              from load_log lg
              join equipment_combos ec on ec.combo_id = lg.combo_id
              join load_lines ll on ll.load_id = lg.load_id
             where ec.trailer_id = x.trailer_id and lg.status = 'loaded' and lg.completed_at is not null
               and lg.completed_at >= coalesce((select max(w.washed_at) from wash_records w where w.trailer_id = x.trailer_id), '-infinity'::timestamptz)
               and ll.product_id is not null
             order by ll.comp_number, lg.completed_at desc
          ) r), '[]'::jsonb)
    ) order by x.arrived_at desc nulls last), '[]'::jsonb)
  from (
    select p.trip_id, p.arrived_at, p.planned_comps, t.company_id, t.trailer_id, t.driver_id
      from trip_pickups p
      join trips t on t.trip_id = p.trip_id
     where auth.uid() is not null
       and p.terminal_id = p_terminal_id
       and p.left_at is null
       and coalesce(p.outcome, 'loaded') <> 'no_load'
       and t.status in ('draft', 'loading')
       and t.company_id <> coalesce(get_active_company_id(), '00000000-0000-0000-0000-000000000000'::uuid)
  ) x;
$function$

;

CREATE OR REPLACE FUNCTION public.other_carriers_to_location(p_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_loc delivery_locations%rowtype;
  v_company uuid := get_active_company_id();
  v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select * into v_loc from delivery_locations where location_id = p_location_id;
  if not found then return '[]'::jsonb; end if;

  with matches as (
    select dl.location_id
      from delivery_locations dl
     where dl.location_id = v_loc.location_id
        or (
          upper(coalesce(dl.state, '')) = upper(coalesce(v_loc.state, ''))
          and _norm_store_text(dl.name) = _norm_store_text(v_loc.name)
          and _norm_store_text(dl.location_number) = _norm_store_text(v_loc.location_number)
          and (
            (_norm_store_city(dl.city) <> '' and _norm_store_city(dl.city) = _norm_store_city(v_loc.city))
            or (dl.lat is not null and dl.lon is not null and v_loc.lat is not null and v_loc.lon is not null
                and abs(dl.lat - v_loc.lat) < 0.03 and abs(dl.lon - v_loc.lon) < 0.03)
          )
        )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'trip_id', x.trip_id,
      'who', _short_company_name((select c.company_name from companies c where c.company_id = x.company_id)),
      'initials', _driver_initials(x.driver_id),
      'arrived', x.arrived_at is not null,
      'arrived_at', x.arrived_at,
      'sizes', coalesce((select jsonb_agg(jsonb_build_object('comp_number', tc.comp_number, 'size', tc.max_gallons) order by tc.comp_number) from trailer_compartments tc where tc.trailer_id = x.trailer_id), '[]'::jsonb),
      'comps', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
          from trip_compartment_loads cl
         where cl.trip_id = x.trip_id and cl.disposition in ('loaded', 'retained')), '[]'::jsonb)
    ) order by x.arrived_at desc nulls last), '[]'::jsonb) into v_out
  from (
    select distinct on (d.trip_id) d.trip_id, d.arrived_at, t.company_id, t.trailer_id, t.driver_id
      from trip_deliveries d
      join trips t on t.trip_id = d.trip_id
     where d.location_id in (select location_id from matches)
       and d.status = 'planned'
       and t.status in ('loading', 'in_transit', 'delivering')
       and t.company_id <> coalesce(v_company, '00000000-0000-0000-0000-000000000000'::uuid)
     order by d.trip_id, d.seq
  ) x;
  return v_out;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.recent_deliveries_at_location(p_location_id uuid, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_loc delivery_locations%rowtype;
  v_out jsonb;
begin
  select * into v_loc from delivery_locations where location_id = p_location_id;
  if not found or not trip_company_member(v_loc.company_id) then
    return '[]'::jsonb;
  end if;

  with matches as (
    select dl.location_id
      from delivery_locations dl
     where dl.location_id = v_loc.location_id
        or (
          upper(coalesce(dl.state, '')) = upper(coalesce(v_loc.state, ''))
          and _norm_store_text(dl.name) = _norm_store_text(v_loc.name)
          and _norm_store_text(dl.location_number) = _norm_store_text(v_loc.location_number)
          and (
            (_norm_store_city(dl.city) <> '' and _norm_store_city(dl.city) = _norm_store_city(v_loc.city))
            or (dl.lat is not null and dl.lon is not null and v_loc.lat is not null and v_loc.lon is not null
                and abs(dl.lat - v_loc.lat) < 0.03 and abs(dl.lon - v_loc.lon) < 0.03)
          )
        )
  ),
  dels as (
    select d.delivery_id, d.trip_id, d.left_at, d.delivering_driver_id, t.company_id, t.driver_id, t.truck_id, t.trailer_id
      from trip_deliveries d
      join trips t on t.trip_id = d.trip_id
     where d.location_id in (select location_id from matches)
       and d.status = 'complete'
     order by d.left_at desc nulls last
     limit greatest(1, least(coalesce(p_limit, 10), 30))
  )
  select coalesce(jsonb_agg(row_obj order by left_at desc nulls last), '[]'::jsonb) into v_out
  from (
    select x.left_at,
      jsonb_build_object(
        'delivery_id', x.delivery_id,
        'trip_id', case when coalesce(x.delivering_driver_id, x.driver_id) = auth.uid() then x.trip_id end,
        'is_mine', coalesce(x.delivering_driver_id, x.driver_id) = auth.uid(),
        'own_company', x.company_id = v_loc.company_id,
        'initials', _driver_initials(coalesce(x.delivering_driver_id, x.driver_id)),
        'who', case
          when x.company_id = v_loc.company_id then
            coalesce((select p.display_name from profiles p where p.user_id = coalesce(x.delivering_driver_id, x.driver_id)), 'Driver')
          else _short_company_name((select c.company_name from companies c where c.company_id = x.company_id))
        end,
        'left_at', x.left_at,
        'sizes', coalesce((select jsonb_agg(jsonb_build_object('comp_number', tc.comp_number, 'size', tc.max_gallons) order by tc.comp_number)
                             from trailer_compartments tc where tc.trailer_id = x.trailer_id), '[]'::jsonb),
        'truck', case when x.company_id = v_loc.company_id then (select tr.truck_name from trucks tr where tr.truck_id = x.truck_id) end,
        'comps', coalesce((
          select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
            from trip_compartment_loads cl
           where cl.delivery_id = x.delivery_id and cl.disposition = 'delivered'
        ), '[]'::jsonb),
        'products', coalesce((
          select jsonb_agg(jsonb_build_object('product_id', s.product_id, 'gallons', s.g))
            from (select cl.product_id, sum(coalesce(cl.gross_gallons, 0)) g
                    from trip_compartment_loads cl
                   where cl.delivery_id = x.delivery_id and cl.disposition = 'delivered'
                   group by cl.product_id) s
        ), '[]'::jsonb),
        'tanks', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'tank_number', tk.tank_number, 'product_id', tk.product_id,
                   'after', tk.after_reading, 'unit', tk.reading_unit) order by tk.tank_number)
            from trip_delivery_tanks tk
           where tk.delivery_id = x.delivery_id and tk.after_reading is not null
        ), '[]'::jsonb)
      ) row_obj
    from dels x
  ) r;

  return v_out;
end;
$function$

;


-- Squawk: the label is built for each reader (our own company sees initials - truck, another company sees initials -
-- company), so the parts are stored instead of a finished label.
alter table public.squawk_messages add column if not exists sender_initials text;
alter table public.squawk_messages add column if not exists sender_truck text;
alter table public.squawk_messages add column if not exists sender_company text;
update public.squawk_messages m set
  sender_initials = public._driver_initials(m.sender_id),
  sender_company = (select public._short_company_name(c.company_name) from public.companies c where c.company_id = m.company_id),
  sender_truck = case when m.channel_type <> 'city_network' then nullif(trim(regexp_replace(m.sender_label, '^\S+\s*', '')), '') end
 where m.sender_initials is null;

create or replace function public.squawk_member(p_type text, p_key text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; v_co uuid; v_region text; v_area text; v_target uuid;
begin
  if p_user is null then return false; end if;
  parts := string_to_array(p_key, '|');
  if p_type = 'city_network' then
    return exists (select 1 from public.user_companies where user_id = p_user);
  elsif p_type = 'to_rack' then
    -- any company: drivers with an open trip whose pickup at this terminal is not finished
    begin v_target := p_key::uuid; exception when others then return false; end;
    return exists (select 1 from public.trips t join public.trip_pickups k on k.trip_id = t.trip_id
      where t.driver_id = p_user and t.status in ('draft','loading','in_transit','delivering')
        and k.terminal_id = v_target and k.left_at is null and coalesce(k.outcome, '') <> 'no_load');
  elsif p_type = 'to_drop' then
    -- any company: drivers whose open trip has a planned delivery at the same store
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

create or replace function public.squawk_send(p_type text, p_key text, p_body text, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare cfg jsonb := public.squawk_cfg(); v_id uuid; v_exp timestamptz; v_co uuid; v_body text := trim(coalesce(p_body, '')); v_truck text; v_cn text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.squawk_member(p_type, p_key) then raise exception 'You are not in that channel.'; end if;
  if v_body = '' and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then raise exception 'Nothing to send.'; end if;
  if length(v_body) > 1000 then raise exception 'Keep it under 1,000 characters.'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 5 then raise exception 'Five attachments at most.'; end if;
  begin v_co := public.get_active_company_id(); exception when others then v_co := null; end;
  select t.truck_name into v_truck from public.user_settings s join public.trucks t on t.truck_id = s.current_truck_id where s.user_id = auth.uid();
  select public._short_company_name(c.company_name) into v_cn from public.companies c where c.company_id = v_co;
  v_exp := case when p_type in ('city_network','city_internal','company','region') then now() + make_interval(mins => (cfg->>'feed_age')::int)
                when p_type in ('truck','trailer') then 'infinity'::timestamptz
                else now() + make_interval(mins => (cfg->>'unviewed_cap')::int) end;
  insert into public.squawk_messages (channel_type, channel_key, company_id, sender_id, sender_label, sender_initials, sender_truck, sender_company, body, attachments, expires_at)
  values (p_type, p_key, v_co, auth.uid(), public._driver_initials(auth.uid()) || ' - ' || coalesce(v_truck, coalesce(v_cn, '')), public._driver_initials(auth.uid()), v_truck, v_cn, v_body, coalesce(p_attachments, '[]'::jsonb), v_exp) returning id into v_id;
  return v_id;
end $$;
