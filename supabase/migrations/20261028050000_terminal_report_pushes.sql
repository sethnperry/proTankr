-- Which terminal reports have already been pushed to which driver (so a run never repeats).
create table if not exists public.terminal_report_pushes (
  report_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
alter table public.terminal_report_pushes enable row level security;
