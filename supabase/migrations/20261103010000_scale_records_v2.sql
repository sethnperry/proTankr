-- Scale records, second pass. One Scale flow, extended (no second tool):
--   * scale_type: a private / CAT scale (the two-weigh validation) or a DOT scale (often one weigh, no empty).
--     So the empty weigh is now optional: light_weight_lbs may be null (net_weight_lbs, generated, is null then).
--   * ticket photos: capture_id points at the form_captures row the capture sheet wrote.
--   * citation: whether one was written, with its details.
--   * planner_snapshot: what the planner said at that moment (tare, target, planned weight, the load), so a
--     citation can be answered later without reconstructing it.

alter table public.weight_records alter column light_weight_lbs drop not null;
alter table public.weight_records add column if not exists scale_type text not null default 'private';
alter table public.weight_records drop constraint if exists weight_records_scale_type_check;
alter table public.weight_records add constraint weight_records_scale_type_check check (scale_type in ('private', 'dot'));
alter table public.weight_records add column if not exists capture_id uuid;
alter table public.weight_records add column if not exists citation boolean not null default false;
alter table public.weight_records add column if not exists citation_detail jsonb;
alter table public.weight_records add column if not exists planner_snapshot jsonb;

create index if not exists weight_records_company_idx on public.weight_records (company_id, recorded_at desc);
