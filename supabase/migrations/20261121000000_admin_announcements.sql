-- "Hey ProTankr" announcements: a super admin posts a subject + message, every signed-in user sees the subject as a
-- banner until they clear it from inside the message. Clearing is per person.
create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 140),
  body text not null default '' check (char_length(body) <= 4000),
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.announcement_dismissals (
  announcement_id uuid not null references public.admin_announcements(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.admin_announcements enable row level security;
alter table public.announcement_dismissals enable row level security;

create policy announcements_read on public.admin_announcements for select to authenticated using (active or public.is_super_admin());
create policy announcements_write on public.admin_announcements for insert to authenticated with check (public.is_super_admin() and created_by = auth.uid());
create policy announcements_update on public.admin_announcements for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy announcements_delete on public.admin_announcements for delete to authenticated using (public.is_super_admin());

create policy dismissals_own_read on public.announcement_dismissals for select to authenticated using (user_id = auth.uid());
create policy dismissals_own_insert on public.announcement_dismissals for insert to authenticated with check (user_id = auth.uid());
