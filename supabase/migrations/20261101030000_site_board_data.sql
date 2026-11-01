-- Trailer compartment sizes on the recent lists (to draw empty compartments) and when other carriers arrived (on-site time).

create or replace function public.recent_deliveries_at_location(p_location_id uuid, p_limit int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.recent_deliveries_at_location(uuid, int) from public, anon;
grant execute on function public.recent_deliveries_at_location(uuid, int) to authenticated;


create or replace function public.recent_loads_at_terminal(p_terminal_id uuid, p_limit int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid := get_active_company_id();
  v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(row_obj order by left_at desc nulls last), '[]'::jsonb) into v_out
  from (
    select x.left_at,
      jsonb_build_object(
        'pickup_id', x.pickup_id,
        'trip_id', case when x.driver_id = auth.uid() then x.trip_id end,
        'is_mine', x.driver_id = auth.uid(),
        'own_company', x.company_id = v_company,
        'who', case
          when x.company_id = v_company then coalesce((select p.display_name from profiles p where p.user_id = x.driver_id), 'Driver')
          else _short_company_name((select c.company_name from companies c where c.company_id = x.company_id))
        end,
        'truck', case when x.company_id = v_company then (select tr.truck_name from trucks tr where tr.truck_id = x.truck_id) end,
        'left_at', x.left_at,
        'sizes', coalesce((select jsonb_agg(jsonb_build_object('comp_number', tc.comp_number, 'size', tc.max_gallons) order by tc.comp_number)
                             from trailer_compartments tc where tc.trailer_id = x.trailer_id), '[]'::jsonb),
        'comps', coalesce((
          select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
            from trip_compartment_loads cl
           where cl.pickup_id = x.pickup_id and cl.disposition <> 'cancelled'
        ), '[]'::jsonb)
      ) row_obj
    from (
      select p.pickup_id, p.trip_id, p.left_at, t.company_id, t.driver_id, t.truck_id, t.trailer_id
        from trip_pickups p
        join trips t on t.trip_id = p.trip_id
       where p.terminal_id = p_terminal_id and p.left_at is not null and coalesce(p.outcome, 'loaded') <> 'no_load'
       order by p.left_at desc
       limit greatest(1, least(coalesce(p_limit, 5), 20))
    ) x
  ) r;
  return v_out;
end;
$$;

revoke execute on function public.recent_loads_at_terminal(uuid, int) from public, anon;
grant execute on function public.recent_loads_at_terminal(uuid, int) to authenticated;
create or replace function public.other_carriers_to_terminal(p_terminal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'trip_id', x.trip_id,
      'who', _short_company_name((select c.company_name from companies c where c.company_id = x.company_id)),
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
    select p.trip_id, p.arrived_at, p.planned_comps, t.company_id, t.trailer_id
      from trip_pickups p
      join trips t on t.trip_id = p.trip_id
     where auth.uid() is not null
       and p.terminal_id = p_terminal_id
       and p.left_at is null
       and coalesce(p.outcome, 'loaded') <> 'no_load'
       and t.status in ('draft', 'loading')
       and t.company_id <> coalesce(get_active_company_id(), '00000000-0000-0000-0000-000000000000'::uuid)
  ) x;
$$;


create or replace function public.other_carriers_to_location(p_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
      'arrived', x.arrived_at is not null,
      'arrived_at', x.arrived_at,
      'sizes', coalesce((select jsonb_agg(jsonb_build_object('comp_number', tc.comp_number, 'size', tc.max_gallons) order by tc.comp_number) from trailer_compartments tc where tc.trailer_id = x.trailer_id), '[]'::jsonb),
      'comps', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
          from trip_compartment_loads cl
         where cl.trip_id = x.trip_id and cl.disposition in ('loaded', 'retained')), '[]'::jsonb)
    ) order by x.arrived_at desc nulls last), '[]'::jsonb) into v_out
  from (
    select distinct on (d.trip_id) d.trip_id, d.arrived_at, t.company_id, t.trailer_id
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
$$;


revoke execute on function public.recent_deliveries_at_location(uuid, int) from public, anon;
grant execute on function public.recent_deliveries_at_location(uuid, int) to authenticated;
revoke execute on function public.recent_loads_at_terminal(uuid, int) from public, anon;
grant execute on function public.recent_loads_at_terminal(uuid, int) to authenticated;
revoke execute on function public.other_carriers_to_terminal(uuid) from public, anon;
grant execute on function public.other_carriers_to_terminal(uuid) to authenticated;
revoke execute on function public.other_carriers_to_location(uuid) from public, anon;
grant execute on function public.other_carriers_to_location(uuid) to authenticated;
