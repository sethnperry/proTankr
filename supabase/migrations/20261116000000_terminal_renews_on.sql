-- When a driver's access card at a terminal renews: 'gate' = the moment loading starts (they got through the gate),
-- 'load' = only after the load is actually completed (the terminal needs a printed BOL to count the visit).
alter table public.terminals add column if not exists renews_on text not null default 'gate' check (renews_on in ('gate', 'load'));
update public.terminals set renews_on = 'load' where terminal_name = 'Global South';
