-- Recent deliveries at a store, every carrier (Driver Dashboard).
--
-- delivery_locations is per company, so the same store saved by two carriers
-- is two rows. A row matches the caller's location when it's in the same
-- state, has the same normalized name and store number, and is either in the
-- same normalized city or within 2 miles by coordinates.
--
-- Returns only what a driver at the store would see anyway: who (our own
-- drivers by name, another carrier by a short company name), gross gallons
-- per product, when it finished, and the after-delivery tank readings.
-- trip_id comes back only for the caller's own deliveries (no PTD for anyone
-- else, even in the same company).

create or replace function public._norm_store_text(p text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g')
$$;

create or replace function public._norm_store_city(p text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(lower(coalesce(p, '')), '^\s*ft\.?\s*', 'fort ', 'g'),
             '^\s*st\.?\s*', 'saint ', 'g'),
           '^\s*pt\.?\s*', 'port ', 'g'),
         '[^a-z]', '', 'g')
$$;

create or replace function public._short_company_name(p text)
returns text language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then 'Carrier'
    when length(split_part(btrim(p), ' ', 1)) >= 4 then left(split_part(btrim(p), ' ', 1), 14)
    else left(split_part(btrim(p), ' ', 1) || ' ' || split_part(btrim(p), ' ', 2), 14)
  end
$$;

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
    select d.delivery_id, d.trip_id, d.left_at, d.delivering_driver_id, t.company_id, t.driver_id
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
