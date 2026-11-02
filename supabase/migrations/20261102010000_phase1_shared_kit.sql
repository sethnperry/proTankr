-- Phase 1 shared kit for the Jotform retirement (see the build plan doc): shift events, capture storage,
-- reason categories, locations kinds, work orders, error log, approval tokens, notification schedules.
-- Role checks use the existing helpers: is_company_member / is_company_staff / is_company_admin.

-- ── Shift events ────────────────────────────────────────────────────────────
-- trip_events.trip_id is NOT NULL with a foreign key to trips, so shift-level events (start shift, call-out,
-- non-productive time, safety meeting, document drop) get their own append-only table. Same shape as
-- trip_events, plus who the shift belongs to and where the event came from.
create table if not exists public.shift_events (
  event_id    uuid primary key,
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,   -- the driver the shift belongs to
  event_type  text not null check (length(event_type) > 0),
  occurred_at timestamptz not null,
  actor_id    uuid not null references auth.users(id),                      -- who made the entry (a dispatcher can)
  payload     jsonb not null default '{}'::jsonb,
  source      text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  created_at  timestamptz not null default now()
);
create index if not exists shift_events_user_idx on public.shift_events (user_id, occurred_at desc);
create index if not exists shift_events_company_idx on public.shift_events (company_id, occurred_at desc);
alter table public.shift_events enable row level security;
drop policy if exists shift_events_select on public.shift_events;
create policy shift_events_select on public.shift_events
  for select using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists shift_events_insert on public.shift_events;
create policy shift_events_insert on public.shift_events
  for insert with check (
    actor_id = auth.uid()
    and ((user_id = auth.uid() and public.is_company_member(company_id)) or public.is_company_staff(company_id))
  );
-- No update or delete: append-only.

-- ── Reason lists: more kinds, and a category per reason ────────────────────
alter table public.delay_reasons add column if not exists category text;
alter table public.delay_reasons drop constraint if exists delay_reasons_kind_check;
alter table public.delay_reasons add constraint delay_reasons_kind_check
  check (kind in ('loading', 'delivery', 'shift_explanation', 'callout', 'nonproductive', 'paper_log'));

-- ── Locations: what kind of place ──────────────────────────────────────────
alter table public.delivery_locations add column if not exists place_kind text not null default 'store';
alter table public.delivery_locations drop constraint if exists delivery_locations_place_kind_check;
alter table public.delivery_locations add constraint delivery_locations_place_kind_check
  check (place_kind in ('store', 'yard', 'maintenance', 'terminal'));

-- ── Work orders ────────────────────────────────────────────────────────────
create table if not exists public.work_orders (
  work_order_id uuid primary key,
  company_id    uuid not null references public.companies(company_id) on delete cascade,
  truck_id      uuid references public.trucks(truck_id) on delete set null,
  trailer_id    uuid references public.trailers(trailer_id) on delete set null,
  subject       text not null check (length(btrim(subject)) > 0),
  source        text not null check (source in ('pump_down', 'failed_inspection', 'repair_request', 'other')),
  status        text not null default 'open' check (status in ('open', 'awaiting_approval', 'approved', 'denied', 'planned', 'done', 'cancelled')),
  source_ref    uuid,                      -- the fuel stop, inspection or repair request that made it
  detail        jsonb not null default '{}'::jsonb,
  reported_by   uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  client_updated_at timestamptz
);
create index if not exists work_orders_company_idx on public.work_orders (company_id, status, created_at desc);
alter table public.work_orders enable row level security;
drop policy if exists work_orders_select on public.work_orders;
create policy work_orders_select on public.work_orders for select using (public.is_company_member(company_id));
drop policy if exists work_orders_insert on public.work_orders;
create policy work_orders_insert on public.work_orders for insert with check (public.is_company_member(company_id) and reported_by = auth.uid());
drop policy if exists work_orders_update on public.work_orders;
create policy work_orders_update on public.work_orders for update
  using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));

-- ── Error log (Desk) ───────────────────────────────────────────────────────
create table if not exists public.app_errors (
  error_id    uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(company_id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  kind        text not null check (kind in ('send_failed', 'sync_stuck', 'telematics_link', 'geotab_mismatch', 'other')),
  message     text not null default '',
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists app_errors_open_idx on public.app_errors (company_id, created_at desc) where resolved_at is null;
alter table public.app_errors enable row level security;
drop policy if exists app_errors_insert on public.app_errors;
create policy app_errors_insert on public.app_errors for insert
  with check (user_id = auth.uid() and (company_id is null or public.is_company_member(company_id)));
drop policy if exists app_errors_select on public.app_errors;
create policy app_errors_select on public.app_errors for select
  using (user_id = auth.uid() or (company_id is not null and public.is_company_staff(company_id)));
drop policy if exists app_errors_update on public.app_errors;
create policy app_errors_update on public.app_errors for update
  using (company_id is not null and public.is_company_staff(company_id))
  with check (company_id is not null and public.is_company_staff(company_id));

-- ── Signed-link approvals ──────────────────────────────────────────────────
-- Only a hash of each token is stored. Deny-by-default RLS: only the server routes (service role) touch it.
create table if not exists public.approval_tokens (
  token_hash   text primary key,
  company_id   uuid not null references public.companies(company_id) on delete cascade,
  purpose      text not null,                 -- e.g. repair_request
  subject_id   uuid not null,                 -- the work order (or other record) being decided
  decision     text not null check (decision in ('approve', 'deny')),   -- what THIS link does
  approver     text,                          -- the approver's email, for the record
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by_hash text
);
create index if not exists approval_tokens_subject_idx on public.approval_tokens (subject_id);
alter table public.approval_tokens enable row level security;

-- ── Notification schedules (reminders and recaps; no form sends its own) ───
create table if not exists public.notification_schedules (
  schedule_id  uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(company_id) on delete cascade,
  kind         text not null check (kind in ('reminder', 'recap')),
  template_key text not null,
  recipients   jsonb not null default '[]'::jsonb,   -- [{ "type": "email" | "user" | "role", "value": "…" }]
  channels     text[] not null default '{email}',
  cadence      jsonb not null default '{}'::jsonb,   -- { "freq": "once|daily|weekly|monthly", "at": "08:00", "dow": 1, "dom": 1, "tz": "America/New_York" }
  payload      jsonb not null default '{}'::jsonb,
  next_run_at  timestamptz,
  last_run_at  timestamptz,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists notification_schedules_due_idx on public.notification_schedules (next_run_at) where is_active;
alter table public.notification_schedules enable row level security;
drop policy if exists notification_schedules_select on public.notification_schedules;
create policy notification_schedules_select on public.notification_schedules for select using (public.is_company_staff(company_id));
drop policy if exists notification_schedules_write on public.notification_schedules;
create policy notification_schedules_write on public.notification_schedules for all
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- ── Capture storage ────────────────────────────────────────────────────────
create table if not exists public.form_captures (
  capture_id  uuid primary key,
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  purpose     text not null,                   -- fuel_receipt, scale_ticket, tank_ticket, document, down_time …
  ref_type    text,                            -- what it belongs to (fuel_purchase, shift_event, work_order …)
  ref_id      uuid,
  file_paths  text[] not null default '{}',
  ocr         jsonb,                           -- what the optional reader found, kept beside the photo
  source      text not null default 'app' check (source in ('geotab', 'app', 'manual')),
  created_at  timestamptz not null default now(),
  client_updated_at timestamptz
);
create index if not exists form_captures_company_idx on public.form_captures (company_id, purpose, created_at desc);
alter table public.form_captures enable row level security;
drop policy if exists form_captures_select on public.form_captures;
create policy form_captures_select on public.form_captures for select using (user_id = auth.uid() or public.is_company_staff(company_id));
drop policy if exists form_captures_insert on public.form_captures;
create policy form_captures_insert on public.form_captures for insert with check (user_id = auth.uid() and public.is_company_member(company_id));
drop policy if exists form_captures_update on public.form_captures;
create policy form_captures_update on public.form_captures for update using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('form-captures', 'form-captures', false) on conflict (id) do nothing;
drop policy if exists "form captures upload own" on storage.objects;
create policy "form captures upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'form-captures'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_company_member(((storage.foldername(name))[1])::uuid)
  );
drop policy if exists "form captures read" on storage.objects;
create policy "form captures read" on storage.objects for select to authenticated
  using (
    bucket_id = 'form-captures'
    and ((storage.foldername(name))[2] = auth.uid()::text or public.is_company_staff(((storage.foldername(name))[1])::uuid))
  );
drop policy if exists "form captures delete own" on storage.objects;
create policy "form captures delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'form-captures' and (storage.foldername(name))[2] = auth.uid()::text);
