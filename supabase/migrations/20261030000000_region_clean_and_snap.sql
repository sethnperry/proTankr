-- Regions are defined by the company admin (equipment_regions) and everywhere
-- else is a selection. This cleans stray whitespace already stored and keeps
-- trucks/trailers from storing a spelling that differs from the catalog.

create or replace function public._clean_ws(p text) returns text
language sql immutable as $$ select nullif(btrim(regexp_replace(coalesce(p,''), '\s+', ' ', 'g')), '') $$;

-- 1) clean what's there
update public.equipment_regions set name = public._clean_ws(name) where name is distinct from public._clean_ws(name);
update public.trucks   set region = public._clean_ws(region) where region is distinct from public._clean_ws(region);
update public.trailers set region = public._clean_ws(region) where region is distinct from public._clean_ws(region);
update public.profiles set region = public._clean_ws(region) where region is distinct from public._clean_ws(region);
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='delivery_locations' and column_name='region') then
    execute 'update public.delivery_locations set region = public._clean_ws(region) where region is distinct from public._clean_ws(region)';
  end if;
end $$;

-- 2) snap trucks/trailers to the catalog spelling when the region is set or changed
create or replace function public.snap_unit_region() returns trigger
language plpgsql as $$
declare canon text;
begin
  if tg_op = 'UPDATE' and new.region is not distinct from old.region then return new; end if;
  new.region := public._clean_ws(new.region);
  if new.region is not null then
    select r.name into canon from public.equipment_regions r
     where r.company_id = new.company_id and r.is_active
       and public.normalize_place_name(r.name) = public.normalize_place_name(new.region)
     order by r.created_at limit 1;
    if canon is not null then new.region := canon; end if;
  end if;
  return new;
end $$;

drop trigger if exists zz_snap_region on public.trucks;
create trigger zz_snap_region before insert or update on public.trucks for each row execute function public.snap_unit_region();
drop trigger if exists zz_snap_region on public.trailers;
create trigger zz_snap_region before insert or update on public.trailers for each row execute function public.snap_unit_region();
