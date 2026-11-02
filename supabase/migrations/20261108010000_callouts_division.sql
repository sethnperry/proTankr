-- "Department" is called "Division" everywhere (it is the driver's profile division). Rename the columns.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'callouts' and column_name = 'department') then
    alter table public.callouts rename column department to division;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'callout_routes' and column_name = 'department') then
    alter table public.callout_routes rename column department to division;
  end if;
end $$;
