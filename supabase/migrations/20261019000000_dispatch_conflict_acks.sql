-- Dispatch Dashboard: a dispatcher marks a conflict handled and leaves a note.
-- One row per terminal report. A conflict reads as handled only while every
-- report in it is acked, so a new report re-opens it (see lib/dispatch/acks.ts).
-- report_id deliberately has no foreign key: reports are deleted when cleared,
-- and an orphaned ack is harmless.
-- Readable and writable by company staff (is_company_staff: owner, admin,
-- lead, dispatch). No delete policy.

create table if not exists public.dispatch_conflict_acks (
  company_id  uuid not null references public.companies(company_id) on delete cascade,
  report_id   uuid not null,
  terminal_id uuid,
  acked_by    uuid not null references auth.users(id),
  acked_at    timestamptz not null default now(),
  note        text,
  primary key (company_id, report_id)
);

alter table public.dispatch_conflict_acks enable row level security;

drop policy if exists dispatch_conflict_acks_select on public.dispatch_conflict_acks;
create policy dispatch_conflict_acks_select on public.dispatch_conflict_acks
  for select to authenticated using (public.is_company_staff(company_id));

drop policy if exists dispatch_conflict_acks_insert on public.dispatch_conflict_acks;
create policy dispatch_conflict_acks_insert on public.dispatch_conflict_acks
  for insert to authenticated
  with check (public.is_company_staff(company_id) and acked_by = auth.uid());

drop policy if exists dispatch_conflict_acks_update on public.dispatch_conflict_acks;
create policy dispatch_conflict_acks_update on public.dispatch_conflict_acks
  for update to authenticated
  using (public.is_company_staff(company_id))
  with check (public.is_company_staff(company_id) and acked_by = auth.uid());
