-- Trip package emails and the End of Day report.
alter table public.profiles add column if not exists email_trip_package boolean not null default false;

create or replace function public.set_email_trip_package(p_on boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.profiles (user_id, email_trip_package) values (auth.uid(), p_on)
  on conflict (user_id) do update set email_trip_package = excluded.email_trip_package, updated_at = now();
$$;
revoke all on function public.set_email_trip_package(boolean) from public, anon;
grant execute on function public.set_email_trip_package(boolean) to authenticated;

-- Who was sent what, so a trip is never auto-sent twice and sends can be limited.
create table if not exists public.trip_package_log (
  log_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  trip_id uuid not null,
  user_id uuid not null,
  mode text not null check (mode in ('auto','manual')),
  recipients int not null default 1,
  sent_at timestamptz not null default now()
);
create index if not exists trip_package_log_trip on public.trip_package_log (trip_id, user_id, mode);
alter table public.trip_package_log enable row level security;
drop policy if exists trip_package_log_read on public.trip_package_log;
create policy trip_package_log_read on public.trip_package_log for select using (user_id = auth.uid() or public.is_company_staff(company_id));

-- End of Day report: one setting row per company.
create table if not exists public.eod_report_settings (
  company_id uuid primary key references public.companies(company_id) on delete cascade,
  enabled boolean not null default false,
  regions text[] not null default '{}',
  recipients text[] not null default '{}',
  send_at text not null default '04:30',
  tz text not null default 'America/New_York',
  last_for_date date,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.eod_report_settings enable row level security;
drop policy if exists eod_settings_read on public.eod_report_settings;
create policy eod_settings_read on public.eod_report_settings for select using (public.is_company_staff(company_id));
drop policy if exists eod_settings_write on public.eod_report_settings;
create policy eod_settings_write on public.eod_report_settings for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
