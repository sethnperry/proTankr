-- Run AFTER applying supabase/migrations/20261011000000_trip_feedback.sql.
-- One query. The top row says "ALL N CHECKS PASSED" or lists what failed.
with checks(name, ok) as (
  values
    ('suppliers table exists', to_regclass('public.suppliers') is not null),
    ('suppliers RLS on', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.suppliers')), false)),
    ('suppliers has 3 policies', (select count(*) from pg_policies where schemaname='public' and tablename='suppliers') = 3),
    ('suppliers sync trigger', exists (select 1 from pg_trigger where tgname='suppliers_sync')),
    ('trip_compartment_loads.supplier_id', exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='trip_compartment_loads' and column_name='supplier_id')),
    ('delivery_locations.zip', exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='delivery_locations' and column_name='zip'))
)
select case when bool_and(ok) then 'ALL ' || count(*) || ' CHECKS PASSED'
            else 'FAILED: ' || string_agg(name, ', ') filter (where not ok) end as result
from checks;
