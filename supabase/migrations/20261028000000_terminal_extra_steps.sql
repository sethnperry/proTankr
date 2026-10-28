-- Extra access steps a terminal needs beyond the standard questions (set by admin/dispatch),
-- and each driver's completion times for them.
alter table public.terminal_access_requirements add column if not exists extra_steps jsonb not null default '[]'::jsonb;
alter table public.driver_terminal_qualifications add column if not exists extras_done jsonb not null default '{}'::jsonb;
