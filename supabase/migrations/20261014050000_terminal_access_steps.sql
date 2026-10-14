-- Terminal access steps (2026-10-14).
--
-- Getting access at a terminal takes a sequence of steps: a company
-- authorization letter, a training video or PowerPoint, registering on the
-- terminal's website, an onsite orientation, training loads ending with a
-- check load with an operator, and finally a card issued.
--
-- terminal_access_requirements: what a terminal asks for. One row per
--   terminal, shared by every company (steps don't differ by company). Set up
--   together by drivers, company admins and ProTankr admins, so any signed-in
--   user can add or edit it (same open model as rack_product_status).
-- driver_authorization_letters: the driver's company authorization letter.
--   Stays with the driver and can be attached to several terminals. Files live
--   in the existing equipment-docs bucket under {company_id}/authorization_letters/.
-- driver_terminal_qualifications: one row per driver per terminal, tracking
--   which steps are done. Training loads are counted from the driver's
--   completed loads at the terminal since started_at, plus loads_adjust for
--   loads done before the app (or corrections).

create table if not exists public.terminal_access_requirements (
  terminal_id uuid primary key references public.terminals(terminal_id) on delete cascade,
  training_loads_required int check (training_loads_required between 1 and 50),
  has_training_media boolean,
  training_media_url text,
  new_user_url text,
  letter_required boolean,
  letter_due text check (letter_due in ('before_first_load', 'before_check_load', 'before_card', 'unknown')),
  has_orientation boolean,
  orientation_schedule text,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.terminal_access_requirements_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end $$;

drop trigger if exists trg_terminal_access_requirements_touch on public.terminal_access_requirements;
create trigger trg_terminal_access_requirements_touch
  before insert or update on public.terminal_access_requirements
  for each row execute function public.terminal_access_requirements_touch();

alter table public.terminal_access_requirements enable row level security;
drop policy if exists tar_read on public.terminal_access_requirements;
create policy tar_read on public.terminal_access_requirements for select to authenticated using (true);
drop policy if exists tar_insert on public.terminal_access_requirements;
create policy tar_insert on public.terminal_access_requirements for insert to authenticated with check (auth.uid() is not null);
drop policy if exists tar_update on public.terminal_access_requirements;
create policy tar_update on public.terminal_access_requirements for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists public.driver_authorization_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  company_id uuid not null,
  file_path text not null,
  original_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index if not exists driver_authorization_letters_user_idx on public.driver_authorization_letters (user_id, created_at desc);

alter table public.driver_authorization_letters enable row level security;
drop policy if exists dal_read on public.driver_authorization_letters;
create policy dal_read on public.driver_authorization_letters for select to authenticated
  using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists dal_insert on public.driver_authorization_letters;
create policy dal_insert on public.driver_authorization_letters for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.user_companies uc where uc.user_id = auth.uid() and uc.company_id = driver_authorization_letters.company_id));
drop policy if exists dal_update on public.driver_authorization_letters;
create policy dal_update on public.driver_authorization_letters for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dal_delete on public.driver_authorization_letters;
create policy dal_delete on public.driver_authorization_letters for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.driver_terminal_qualifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  terminal_id uuid not null references public.terminals(terminal_id) on delete cascade,
  company_id uuid,
  started_at timestamptz not null default now(),
  letter_id uuid references public.driver_authorization_letters(id) on delete set null,
  letter_attached_at timestamptz,
  media_done_at timestamptz,
  registered_at timestamptz,
  orientation_done_at timestamptz,
  loads_adjust int not null default 0,
  card_issued_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, terminal_id)
);

create or replace function public.driver_terminal_qualifications_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_driver_terminal_qualifications_touch on public.driver_terminal_qualifications;
create trigger trg_driver_terminal_qualifications_touch
  before update on public.driver_terminal_qualifications
  for each row execute function public.driver_terminal_qualifications_touch();

alter table public.driver_terminal_qualifications enable row level security;
drop policy if exists dtq_read on public.driver_terminal_qualifications;
create policy dtq_read on public.driver_terminal_qualifications for select to authenticated
  using (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)));
drop policy if exists dtq_insert on public.driver_terminal_qualifications;
create policy dtq_insert on public.driver_terminal_qualifications for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists dtq_update on public.driver_terminal_qualifications;
create policy dtq_update on public.driver_terminal_qualifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists dtq_delete on public.driver_terminal_qualifications;
create policy dtq_delete on public.driver_terminal_qualifications for delete to authenticated
  using (user_id = auth.uid());
