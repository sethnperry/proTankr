-- Recent deliveries: add the truck (our own company only) and the compartments delivered, for the trailer view.
-- Plus recent loads at a terminal, every carrier (the To Rack chip): who, when, and the compartments loaded.

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
    select d.delivery_id, d.trip_id, d.left_at, d.delivering_driver_id, t.company_id, t.driver_id, t.truck_id
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
        'comps', coalesce((
          select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
            from trip_compartment_loads cl
           where cl.pickup_id = x.pickup_id and cl.disposition <> 'cancelled'
        ), '[]'::jsonb)
      ) row_obj
    from (
      select p.pickup_id, p.trip_id, p.left_at, t.company_id, t.driver_id, t.truck_id
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
