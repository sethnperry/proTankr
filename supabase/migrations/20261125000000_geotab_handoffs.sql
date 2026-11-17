-- A driver signed in to a truck in the tracker who never opened the app: the server holds the pair for them and
-- records a handoff, so the next person to take the trailer is asked what it was left with. Also what a trailer's
-- compartments last held when that was told to us instead of coming from a logged load.

create table if not exists public.equipment_handoffs (
  handoff_id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,                 -- the driver the tracker showed in the truck
  truck_id uuid,
  trailer_id uuid,
  source text not null default 'geotab',
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,                  -- the driver signed out and the pair was released
  resolved_at timestamptz,               -- someone said what the trailer was left with
  resolved_by uuid,
  resolved_kind text,                    -- empty | partial | preloaded | unknown
  note text
);
create index if not exists equipment_handoffs_open on public.equipment_handoffs (company_id) where resolved_at is null;
create index if not exists equipment_handoffs_trailer on public.equipment_handoffs (trailer_id) where resolved_at is null;
alter table public.equipment_handoffs enable row level security;
drop policy if exists equipment_handoffs_read on public.equipment_handoffs;
create policy equipment_handoffs_read on public.equipment_handoffs for select using (public.trip_company_member(company_id));
drop policy if exists equipment_handoffs_resolve on public.equipment_handoffs;
create policy equipment_handoffs_resolve on public.equipment_handoffs for update using (public.trip_company_member(company_id)) with check (public.trip_company_member(company_id));

create table if not exists public.trailer_residue_notes (
  trailer_id uuid not null,
  comp_number int not null,
  company_id uuid not null,
  product_id uuid,
  set_by uuid,
  set_at timestamptz not null default now(),
  primary key (trailer_id, comp_number)
);
alter table public.trailer_residue_notes enable row level security;
drop policy if exists trailer_residue_notes_read on public.trailer_residue_notes;
create policy trailer_residue_notes_read on public.trailer_residue_notes for select using (public.trip_company_member(company_id));
drop policy if exists trailer_residue_notes_write on public.trailer_residue_notes;
create policy trailer_residue_notes_write on public.trailer_residue_notes for all using (public.trip_company_member(company_id)) with check (public.trip_company_member(company_id));
