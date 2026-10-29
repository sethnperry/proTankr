-- Delays logged from the Begin Loading step carried no pickup id. Count them too, by matching the
-- delay to the trip's pickup at this terminal whose arrive..leave window it started in.
create or replace function public.long_line_wait(p_terminal_id uuid, p_since timestamptz default now() - interval '6 hours')
returns table (avg_min numeric, samples integer)
language sql security definer set search_path = public stable as $$
  select round(avg((e.payload->>'minutes')::numeric))::numeric, count(*)::integer
    from trip_events e
    join trip_pickups p on (p.pickup_id = e.pickup_id)
      or (e.pickup_id is null and p.trip_id = e.trip_id
          and p.arrived_at is not null and p.arrived_at <= (e.payload->>'started_at')::timestamptz + interval '1 minute'
          and (p.left_at is null or (e.payload->>'started_at')::timestamptz <= p.left_at))
   where e.event_type = 'delay_logged' and e.payload->>'code' = 'long_line'
     and p.terminal_id = p_terminal_id and e.occurred_at >= p_since
     and (e.payload->>'minutes') is not null
     and (e.payload->>'minutes')::numeric >= 15;
$$;
grant execute on function public.long_line_wait(uuid, timestamptz) to authenticated;
