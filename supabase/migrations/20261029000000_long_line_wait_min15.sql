-- The long-line "avg wait" only counts delays of 15 minutes or more (counted in full, not from the 15 mark).
create or replace function public.long_line_wait(p_terminal_id uuid, p_since timestamptz default now() - interval '6 hours')
returns table (avg_min numeric, samples integer)
language sql security definer set search_path = public stable as $$
  select round(avg((e.payload->>'minutes')::numeric))::numeric, count(*)::integer
    from trip_events e join trip_pickups p on p.pickup_id = e.pickup_id
   where e.event_type = 'delay_logged' and e.payload->>'code' = 'long_line'
     and p.terminal_id = p_terminal_id and e.occurred_at >= p_since
     and (e.payload->>'minutes') is not null
     and (e.payload->>'minutes')::numeric >= 15;
$$;
grant execute on function public.long_line_wait(uuid, timestamptz) to authenticated;
