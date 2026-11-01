-- Other carriers heading to a terminal: add their trailer's compartments and residue.

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


revoke execute on function public.other_carriers_to_terminal(uuid) from public, anon;
grant execute on function public.other_carriers_to_terminal(uuid) to authenticated;
