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
