-- A product marked out at a terminal is clearly back once anyone (any
-- company) completes a load of it there. When a load_log row becomes
-- 'loaded', clear rack_product_status.is_out for the loaded products at the
-- load's rack (every rack at the terminal if the load has no rack) and drop
-- the terminal's active out_of_product reports for those products.
-- SECURITY DEFINER: the driver loading may not be allowed to clear another
-- company's report or row under RLS.

create or replace function public.clear_outage_on_load()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'loaded' or old.status is not distinct from 'loaded' or new.terminal_id is null then
    return new;
  end if;

  update rack_product_status s
     set is_out = false
   where s.is_out
     and s.product_id in (select ll.product_id from load_lines ll where ll.load_id = new.load_id and ll.product_id is not null)
     and (
       (new.rack_id is not null and s.rack_id = new.rack_id)
       or (new.rack_id is null and s.rack_id in (select r.rack_id from terminal_racks r where r.terminal_id = new.terminal_id))
     );

  delete from terminal_outage_reports o
   where o.terminal_id = new.terminal_id
     and o.report_type = 'out_of_product'
     and o.product_id in (select ll.product_id from load_lines ll where ll.load_id = new.load_id and ll.product_id is not null);

  return new;
end;
$$;

revoke execute on function public.clear_outage_on_load() from public, anon, authenticated;

drop trigger if exists trg_clear_outage_on_load on public.load_log;
create trigger trg_clear_outage_on_load
  after update of status on public.load_log
  for each row execute function public.clear_outage_on_load();

-- One-time cleanup: anything still marked out with a completed load of that
-- product at that terminal at or after the flag was last touched.
update rack_product_status s
   set is_out = false
  from terminal_racks r
 where r.rack_id = s.rack_id
   and s.is_out
   and exists (
     select 1 from load_log l join load_lines ll on ll.load_id = l.load_id
      where l.terminal_id = r.terminal_id and ll.product_id = s.product_id
        and l.status = 'loaded' and l.completed_at >= s.updated_at - interval '1 hour'
   );

delete from terminal_outage_reports o
 where o.report_type = 'out_of_product'
   and exists (
     select 1 from load_log l join load_lines ll on ll.load_id = l.load_id
      where l.terminal_id = o.terminal_id and ll.product_id = o.product_id
        and l.status = 'loaded' and l.completed_at > o.created_at
   );
