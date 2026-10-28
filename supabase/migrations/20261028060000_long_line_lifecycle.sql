-- A long line is not cleared because someone loaded (unlike an out-of-product flag). It clears on
-- its own an hour after the last load or rack-hop departure at that terminal, whichever is later.
-- The app reads last_activity_at; these triggers keep it current.
alter table public.terminal_outage_reports add column if not exists last_activity_at timestamptz;

create or replace function public.touch_long_line_on_load()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'loaded' or old.status is not distinct from 'loaded' or new.terminal_id is null then return new; end if;
  update terminal_outage_reports o
     set last_activity_at = greatest(coalesce(o.last_activity_at, 'epoch'::timestamptz), coalesce(new.completed_at, now()))
   where o.terminal_id = new.terminal_id and o.report_type = 'long_line';
  return new;
end; $$;
revoke execute on function public.touch_long_line_on_load() from public, anon, authenticated;
drop trigger if exists trg_touch_long_line_on_load on public.load_log;
create trigger trg_touch_long_line_on_load after update on public.load_log
  for each row execute function public.touch_long_line_on_load();

create or replace function public.touch_long_line_on_hop()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.outcome is distinct from 'no_load' or new.left_at is null or new.terminal_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.left_at is not distinct from new.left_at and old.outcome is not distinct from new.outcome then return new; end if;
  update terminal_outage_reports o
     set last_activity_at = greatest(coalesce(o.last_activity_at, 'epoch'::timestamptz), new.left_at)
   where o.terminal_id = new.terminal_id and o.report_type = 'long_line';
  return new;
end; $$;
revoke execute on function public.touch_long_line_on_hop() from public, anon, authenticated;
drop trigger if exists trg_touch_long_line_on_hop on public.trip_pickups;
create trigger trg_touch_long_line_on_hop after insert or update on public.trip_pickups
  for each row execute function public.touch_long_line_on_hop();

-- Average wait drivers logged as "Long line" through the delay button at a terminal (any company).
create or replace function public.long_line_wait(p_terminal_id uuid, p_since timestamptz default now() - interval '6 hours')
returns table (avg_min numeric, samples integer)
language sql security definer set search_path = public stable as $$
  select round(avg((e.payload->>'minutes')::numeric))::numeric, count(*)::integer
    from trip_events e join trip_pickups p on p.pickup_id = e.pickup_id
   where e.event_type = 'delay_logged' and e.payload->>'code' = 'long_line'
     and p.terminal_id = p_terminal_id and e.occurred_at >= p_since
     and (e.payload->>'minutes') is not null;
$$;
grant execute on function public.long_line_wait(uuid, timestamptz) to authenticated;
