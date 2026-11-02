-- Unit maintenance: inspections and campaigns.
--   unit_inspections: one row per inspection a driver does on a truck or trailer. items is the checklist with a
--     condition for each (good, fair, replace_soon); overall is the worst one. A row made for a campaign starts
--     review_status 'pending' and an admin marks it reviewed; an ordinary one is 'none' and never needs review.
--     Written through the phone's offline store (insert-only there), so the id is made on the phone.
--   inspection_campaigns: management asks every unit of a kind (optionally one region) to be inspected by a date.
--     The board is computed: which units have a campaign inspection and which don't.
-- Everyone in the company can read inspections (a slip-seat driver sees the last driver's condition notes);
-- only admins create campaigns and review.

create table if not exists public.inspection_campaigns (
  campaign_id uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  unit_kind   text not null check (unit_kind in ('truck', 'trailer', 'both')),
  region      text,
  due_on      date,
  created_by  uuid references auth.users(id),
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists inspection_campaigns_company_idx on public.inspection_campaigns (company_id, created_at desc);
alter table public.inspection_campaigns enable row level security;
drop policy if exists inspection_campaigns_select on public.inspection_campaigns;
create policy inspection_campaigns_select on public.inspection_campaigns for select using (public.is_company_member(company_id));
drop policy if exists inspection_campaigns_write on public.inspection_campaigns;
create policy inspection_campaigns_write on public.inspection_campaigns for all
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

create table if not exists public.unit_inspections (
  inspection_id uuid primary key,
  company_id    uuid not null references public.companies(company_id) on delete cascade,
  unit_kind     text not null check (unit_kind in ('truck', 'trailer')),
  truck_id      uuid references public.trucks(truck_id) on delete cascade,
  trailer_id    uuid references public.trailers(trailer_id) on delete cascade,
  driver_id     uuid not null references auth.users(id),
  campaign_id   uuid references public.inspection_campaigns(campaign_id) on delete set null,
  items         jsonb not null default '[]'::jsonb,   -- [{key, label, condition, note}]
  overall       text not null check (overall in ('good', 'fair', 'replace_soon')),
  notes         text,
  capture_id    uuid,                                  -- the photos (form_captures)
  review_status text not null default 'none' check (review_status in ('none', 'pending', 'reviewed')),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  client_updated_at timestamptz,
  check ((unit_kind = 'truck' and truck_id is not null and trailer_id is null) or (unit_kind = 'trailer' and trailer_id is not null and truck_id is null))
);
create index if not exists unit_inspections_company_idx on public.unit_inspections (company_id, created_at desc);
create index if not exists unit_inspections_truck_idx on public.unit_inspections (truck_id, created_at desc);
create index if not exists unit_inspections_trailer_idx on public.unit_inspections (trailer_id, created_at desc);
create index if not exists unit_inspections_campaign_idx on public.unit_inspections (campaign_id);
alter table public.unit_inspections enable row level security;
drop policy if exists unit_inspections_select on public.unit_inspections;
create policy unit_inspections_select on public.unit_inspections for select using (public.is_company_member(company_id));
drop policy if exists unit_inspections_insert on public.unit_inspections;
create policy unit_inspections_insert on public.unit_inspections for insert
  with check (driver_id = auth.uid() and public.is_company_member(company_id) and review_status in ('none', 'pending') and reviewed_by is null);
drop policy if exists unit_inspections_review on public.unit_inspections;
create policy unit_inspections_review on public.unit_inspections for update
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
