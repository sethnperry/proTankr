-- Trip workflow phase 1: pre-flight check before applying
-- supabase/migrations/20261010000000_trip_workflow_phase1.sql
--
-- READ-ONLY. One query, so the Supabase SQL editor (which only shows the last
-- result set) shows everything. The first row is the summary:
--   "ALL N CHECKS PASSED" -> safe to apply the migration.
--   anything else         -> read the FAIL rows below it and stop.
--
-- Checks that every table/column/function the migration references exists
-- live (the migrations folder lags the live DB), and that none of the new
-- table names are already taken.

with expected_cols(tbl, col) as (values
  ('companies','company_id'),
  ('trucks','truck_id'),
  ('trailers','trailer_id'),
  ('terminals','terminal_id'),
  ('products','product_id'),
  ('load_log','load_id'),
  ('user_companies','user_id'),
  ('user_companies','company_id'),
  ('wash_records','truck_id')
),
expected_fns(fn) as (values
  ('is_super_admin'), ('is_company_admin'), ('is_company_staff')
),
new_tables(tbl) as (values
  ('trip_settings'), ('delay_reasons'), ('delivery_locations'),
  ('delivery_location_tanks'), ('delivery_location_stars'), ('trips'),
  ('trip_orders'), ('trip_pickups'), ('trip_deliveries'),
  ('trip_delivery_tanks'), ('trip_compartment_loads'), ('trip_events'),
  ('compartment_readiness'), ('driver_signatures')
),
checks as (
  select 'column ' || e.tbl || '.' || e.col as check_name,
         exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = e.tbl
                   and c.column_name = e.col) as ok
  from expected_cols e
  union all
  -- FK targets must be a primary key or unique column.
  select 'unique key on ' || e.tbl || '.' || e.col,
         exists (select 1 from pg_index i
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                 where i.indrelid = to_regclass('public.' || e.tbl)
                   and (i.indisprimary or i.indisunique)
                   and i.indnatts = 1 and a.attname = e.col)
  from expected_cols e
  where e.tbl not in ('user_companies','wash_records')
  union all
  select 'function ' || f.fn || '()',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = f.fn)
  from expected_fns f
  union all
  select 'table name free: ' || t.tbl,
         to_regclass('public.' || t.tbl) is null
  from new_tables t
  union all
  select 'wash_records.wash_type not already present',
         not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = 'wash_records'
                       and c.column_name = 'wash_type')
  union all
  select 'gen_random_uuid() available',
         exists (select 1 from pg_proc where proname = 'gen_random_uuid')
)
select summary as result from (
  select 0 as ord,
         case when bool_and(ok) then 'ALL ' || count(*) || ' CHECKS PASSED'
              else count(*) filter (where not ok) || ' OF ' || count(*) || ' CHECKS FAILED' end as summary
  from checks
  union all
  select 1, 'FAIL: ' || check_name from checks where not ok
  union all
  select 2, 'pass: ' || check_name from checks where ok
) r
order by ord, result;
