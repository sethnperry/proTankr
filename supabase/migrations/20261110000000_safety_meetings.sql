-- Safety meetings with an on-screen sign-in.
--   safety_meeting_series: an admin-created series ("every N days", a Zoom link, a PowerPoint).
--   safety_meetings: one occurrence. started_at / ended_at are when it was actually held; closed_at stops sign-in.
--     The series' link and file are copied here so an old meeting keeps what was shown that day.
--   safety_meeting_signatures: each driver's on-screen signature (SVG path), append-only (the audit record).
--   safety_settings: how long records are kept. The default is employment plus 3 years; nothing is deleted
--     automatically, the setting is the company's stated policy.
-- Reminders use the one scheduler (notification_schedules); a reminder can go to "everyone who has not signed".

create table if not exists public.safety_meeting_series (
  series_id       uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(company_id) on delete cascade,
  title           text not null check (length(btrim(title)) > 0),
  interval_days   integer not null check (interval_days between 1 and 365),
  starts_on       date not null,
  zoom_url        text,
  attachment_path text,
  attachment_name text,
  notes           text,
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists safety_series_company_idx on public.safety_meeting_series (company_id);
alter table public.safety_meeting_series enable row level security;
drop policy if exists safety_series_select on public.safety_meeting_series;
create policy safety_series_select on public.safety_meeting_series for select using (public.is_company_member(company_id));
drop policy if exists safety_series_write on public.safety_meeting_series;
create policy safety_series_write on public.safety_meeting_series for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.safety_meetings (
  meeting_id      uuid primary key default gen_random_uuid(),
  series_id       uuid references public.safety_meeting_series(series_id) on delete set null,
  company_id      uuid not null references public.companies(company_id) on delete cascade,
  title           text not null,
  scheduled_for   date not null,
  zoom_url        text,
  attachment_path text,
  attachment_name text,
  started_at      timestamptz,
  ended_at        timestamptz,
  closed_at       timestamptz,
  held_by         uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists safety_meetings_company_idx on public.safety_meetings (company_id, scheduled_for desc);
alter table public.safety_meetings enable row level security;
drop policy if exists safety_meetings_select on public.safety_meetings;
create policy safety_meetings_select on public.safety_meetings for select using (public.is_company_member(company_id));
drop policy if exists safety_meetings_write on public.safety_meetings;
create policy safety_meetings_write on public.safety_meetings for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.safety_meeting_signatures (
  meeting_id uuid not null references public.safety_meetings(meeting_id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(company_id) on delete cascade,
  signature  text not null check (length(signature) > 10),
  signed_at  timestamptz not null default now(),
  primary key (meeting_id, user_id)
);
alter table public.safety_meeting_signatures enable row level security;
drop policy if exists safety_sigs_select on public.safety_meeting_signatures;
create policy safety_sigs_select on public.safety_meeting_signatures for select using (user_id = auth.uid() or public.is_company_staff(company_id));
-- A driver signs only for themselves, and only while the meeting is open (started, not closed).
drop policy if exists safety_sigs_insert on public.safety_meeting_signatures;
create policy safety_sigs_insert on public.safety_meeting_signatures for insert with check (
  user_id = auth.uid() and public.is_company_member(company_id)
  and exists (select 1 from public.safety_meetings m where m.meeting_id = safety_meeting_signatures.meeting_id and m.company_id = safety_meeting_signatures.company_id and m.started_at is not null and m.closed_at is null));
-- No update or delete: the sign-in is the audit record.

create table if not exists public.safety_settings (
  company_id      uuid primary key references public.companies(company_id) on delete cascade,
  retention_years integer not null default 3 check (retention_years between 0 and 30),
  updated_at      timestamptz not null default now()
);
alter table public.safety_settings enable row level security;
drop policy if exists safety_settings_select on public.safety_settings;
create policy safety_settings_select on public.safety_settings for select using (public.is_company_member(company_id));
drop policy if exists safety_settings_write on public.safety_settings;
create policy safety_settings_write on public.safety_settings for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- The PowerPoint for a series: a private bucket, {company_id}/... : the company reads, admins write.
insert into storage.buckets (id, name, public) values ('safety-meetings', 'safety-meetings', false) on conflict (id) do nothing;
drop policy if exists "safety meetings read" on storage.objects;
create policy "safety meetings read" on storage.objects for select to authenticated
  using (bucket_id = 'safety-meetings' and public.is_company_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "safety meetings write" on storage.objects;
create policy "safety meetings write" on storage.objects for insert to authenticated
  with check (bucket_id = 'safety-meetings' and public.is_company_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists "safety meetings delete" on storage.objects;
create policy "safety meetings delete" on storage.objects for delete to authenticated
  using (bucket_id = 'safety-meetings' and public.is_company_admin(((storage.foldername(name))[1])::uuid));
