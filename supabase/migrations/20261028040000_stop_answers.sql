-- Answers to "Did you arrive?" / "Did you load here?" push notifications, tapped from the
-- notification without opening the app. The app applies them (and asks for any reason) the next
-- time the driver opens the dashboard.
create table if not exists public.stop_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  trip_id uuid,
  stop_at timestamptz not null,
  kind text not null check (kind in ('arrive','hop')),
  place_name text,
  answer text check (answer in ('arrived','delay','yes','no')),
  answered_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, stop_at)
);
alter table public.stop_answers enable row level security;
drop policy if exists stop_answers_own_read on public.stop_answers;
create policy stop_answers_own_read on public.stop_answers for select using (user_id = auth.uid());
drop policy if exists stop_answers_own_update on public.stop_answers;
create policy stop_answers_own_update on public.stop_answers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
