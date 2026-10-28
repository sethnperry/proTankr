-- Suppliers are per terminal. A supplier linked to terminals that do NOT share sourcing (terminal_sourcing_groups)
-- is split: the terminal group with the most history keeps it, every other group gets its own copy, and that
-- group's steps and past loads move to the copy. Terminals in one sourcing group (e.g. Buckey North + South)
-- stay together on purpose.
do $$
declare
  s record; u record; keep text; new_id uuid; n int := 0;
begin
  -- unit = the sourcing group of a terminal, or the terminal itself when it has none
  create temp table _units on commit drop as
  select st.supplier_id, st.company_id, st.terminal_id,
         coalesce(g.group_key, 'solo:' || st.terminal_id::text) as unit
  from public.supplier_terminal_steps st
  left join public.terminal_sourcing_groups g on g.company_id = st.company_id and g.terminal_id = st.terminal_id;

  for s in select supplier_id from _units group by supplier_id having count(distinct unit) > 1 loop
    -- the unit with the most past pickups under this supplier keeps it
    select x.unit into keep from (
      select un.unit, count(p.pickup_id) as c
      from _units un left join public.trip_pickups p on p.supplier_id = un.supplier_id and p.terminal_id = un.terminal_id
      where un.supplier_id = s.supplier_id group by un.unit order by c desc, un.unit limit 1) x;
    for u in select distinct unit from _units where supplier_id = s.supplier_id and unit <> keep loop
      new_id := gen_random_uuid();
      insert into public.suppliers (supplier_id, company_id, name, is_active, created_by, client_updated_at)
        select new_id, company_id, name, is_active, created_by, now() from public.suppliers where supplier_id = s.supplier_id;
      update public.supplier_terminal_steps set supplier_id = new_id
        where supplier_id = s.supplier_id and terminal_id in (select terminal_id from _units where supplier_id = s.supplier_id and unit = u.unit);
      update public.supplier_contracts set supplier_id = new_id
        where supplier_id = s.supplier_id and terminal_id in (select terminal_id from _units where unit = u.unit);
      update public.trip_compartment_loads set supplier_id = new_id
        where supplier_id = s.supplier_id and pickup_id in (select pickup_id from public.trip_pickups where supplier_id = s.supplier_id and terminal_id in (select terminal_id from _units where unit = u.unit));
      update public.trip_pickups set supplier_id = new_id
        where supplier_id = s.supplier_id and terminal_id in (select terminal_id from _units where unit = u.unit);
      update public.terminal_outage_reports set supplier_id = new_id
        where supplier_id = s.supplier_id and terminal_id in (select terminal_id from _units where unit = u.unit);
      n := n + 1;
    end loop;
  end loop;
  raise notice 'split % supplier copies', n;
end $$;
