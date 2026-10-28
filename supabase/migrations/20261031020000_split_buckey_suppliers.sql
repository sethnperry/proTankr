-- Buckey North and South no longer share sourcing: each has its own suppliers, loading steps and rules.
delete from public.terminal_sourcing_groups where group_key = 'buckey-tampa';

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

update public.trip_compartment_loads c set supplier_id = m.new_id
from (
  select c2.compartment_load_id, s2.supplier_id as new_id
  from public.trip_compartment_loads c2
  join public.trip_pickups p on p.pickup_id = c2.pickup_id
  join public.suppliers s1 on s1.supplier_id = c2.supplier_id
  join public.suppliers s2 on s2.company_id = s1.company_id and lower(s2.name) = lower(s1.name)
  join public.supplier_terminal_steps st on st.supplier_id = s2.supplier_id and st.terminal_id = p.terminal_id
  where c2.supplier_id is not null
    and not exists (select 1 from public.supplier_terminal_steps x where x.supplier_id = c2.supplier_id and x.terminal_id = p.terminal_id)
) m where c.compartment_load_id = m.compartment_load_id;
