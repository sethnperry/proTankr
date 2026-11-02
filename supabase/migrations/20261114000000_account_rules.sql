-- First American / account rules: every load carries a shipper and a customer. An admin sets rules by account
-- (a customer or shipper name): who is emailed when a load is complete, which documents go, and how long after.
-- A server run sends each (rule, trip) once; account_rule_sends is the record and the guard against repeats.

alter table public.trip_settings add column if not exists require_shipper_customer boolean not null default true;

create table if not exists public.account_rules (
  rule_id       uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(company_id) on delete cascade,
  name          text not null,
  match_field   text not null default 'customer' check (match_field in ('customer', 'shipper', 'either')),
  match_text    text not null,
  match_mode    text not null default 'equals' check (match_mode in ('equals', 'contains')),
  emails        text[] not null,
  documents     text[] not null default '{ptd}',
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 2880),
  is_active     boolean not null default true,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check (cardinality(emails) > 0)
);
create index if not exists account_rules_company_idx on public.account_rules (company_id) where is_active;

create table if not exists public.account_rule_sends (
  rule_id   uuid not null references public.account_rules(rule_id) on delete cascade,
  trip_id   uuid not null references public.trips(trip_id) on delete cascade,
  company_id uuid not null,
  status    text not null check (status in ('sent', 'failed')),
  sent_at   timestamptz not null default now(),
  to_emails text[] not null default '{}',
  error     text,
  primary key (rule_id, trip_id)
);

alter table public.account_rules enable row level security;
alter table public.account_rule_sends enable row level security;
drop policy if exists account_rules_select on public.account_rules;
create policy account_rules_select on public.account_rules for select using (public.is_company_staff(company_id));
drop policy if exists account_rules_write on public.account_rules;
create policy account_rules_write on public.account_rules for all using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists account_rule_sends_select on public.account_rule_sends;
create policy account_rule_sends_select on public.account_rule_sends for select using (public.is_company_staff(company_id));
-- Sends are written only by the server (service role).
