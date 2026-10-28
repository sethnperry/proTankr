-- Saved store tanks for every tank already used on a completed delivery (they were only saved
-- when a reading was entered). Skips a tank the store already has (any capitalization).
insert into public.delivery_location_tanks (location_id, tank_number, product_id, client_updated_at)
select s.location_id, s.tank_number, s.product_id, now()
from (
select distinct on (d.location_id, upper(trim(c.tank_number))) d.location_id, trim(c.tank_number) as tank_number, c.product_id
from trip_compartment_loads c join trip_deliveries d on d.delivery_id = c.delivery_id
where d.location_id is not null and c.tank_number is not null and trim(c.tank_number) <> '' and d.status = 'complete'
order by d.location_id, upper(trim(c.tank_number)), (c.product_id is null), d.left_at desc
) s
where not exists (
  select 1 from public.delivery_location_tanks t
  where t.location_id = s.location_id and upper(trim(t.tank_number)) = upper(s.tank_number)
)
on conflict (location_id, tank_number) do nothing;
