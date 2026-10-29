-- County (or borough) for each delivery location, looked up from its coordinates. Lets the location
-- pickers narrow State -> County -> City.
alter table public.delivery_locations add column if not exists county text;
create index if not exists delivery_locations_county_idx on public.delivery_locations (company_id, state, county) where is_active;
