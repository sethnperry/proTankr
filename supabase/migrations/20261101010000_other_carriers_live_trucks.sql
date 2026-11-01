-- Other carriers' live trucks, for the To Rack and To Drop chips. Nothing secret: a short company name, the
-- status, and what is aboard (or planned) in each compartment. Our own company's trucks come from the normal
-- trips read, so these return other companies only.

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
      'comps', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', (e->>'comp_number')::int, 'product_id', e->>'product_id', 'gallons', 0))
          from jsonb_array_elements(coalesce(x.planned_comps, '[]'::jsonb)) e
         where e->>'product_id' is not null), '[]'::jsonb)
    ) order by x.arrived_at desc nulls last), '[]'::jsonb)
  from (
    select p.trip_id, p.arrived_at, p.planned_comps, t.company_id
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
      'comps', coalesce((
        select jsonb_agg(jsonb_build_object('comp_number', cl.comp_number, 'product_id', cl.product_id, 'gallons', coalesce(cl.gross_gallons, 0)) order by cl.comp_number)
          from trip_compartment_loads cl
         where cl.trip_id = x.trip_id and cl.disposition in ('loaded', 'retained')), '[]'::jsonb)
    ) order by x.arrived_at desc nulls last), '[]'::jsonb) into v_out
  from (
    select distinct on (d.trip_id) d.trip_id, d.arrived_at, t.company_id
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

revoke execute on function public.other_carriers_to_terminal(uuid) from public, anon;
grant execute on function public.other_carriers_to_terminal(uuid) to authenticated;
revoke execute on function public.other_carriers_to_location(uuid) from public, anon;
grant execute on function public.other_carriers_to_location(uuid) to authenticated;
