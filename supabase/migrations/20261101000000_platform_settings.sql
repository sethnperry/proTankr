-- Platform-wide switches the ProTankr operator controls from the ProTankr Dashboard.
-- Everyone signed in can read them (the app checks them); only a super admin can change them.
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.platform_settings enable row level security;
drop policy if exists ps_read on public.platform_settings;
create policy ps_read on public.platform_settings for select to authenticated using (true);
drop policy if exists ps_write on public.platform_settings;
create policy ps_write on public.platform_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Terminal training requirements campaign: when on, the first driver to load at a terminal nobody has
-- described yet is asked what it requires. Off = nobody is asked.
insert into public.platform_settings (key, value) values ('terminal_training_campaign', '{"enabled": true}')
  on conflict (key) do nothing;
