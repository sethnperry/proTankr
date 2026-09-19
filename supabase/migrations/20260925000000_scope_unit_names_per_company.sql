-- Real bug: trucks.truck_name and trailers.trailer_name are each globally
-- unique across the WHOLE table (trucks_truck_name_key / trailers_trailer_
-- name_key, from 20260222172537_remote_schema.sql), not scoped per company.
-- Any two companies in the entire app are blocked from ever using the same
-- unit number/name -- confirmed live: a fleet company ("Gemini") couldn't
-- add a trailer named "5 Comp" because a DIFFERENT company already had one.
-- Common unit numbers/short names (a single digit, "5 Comp", a plain
-- fleet number) are exactly what real companies pick independently of each
-- other, so this constraint was actively hostile to a growing multi-tenant
-- user base, not a rare edge case.
--
-- app/planner/components/SoloOnboarding.tsx's own saveTruck() comment
-- already flagged this exact constraint by name ("truck_name is globally
-- unique... a duplicate is the most likely real failure") -- treated as
-- expected behavior there, but it's the bug itself, not a fact of life.
--
-- Fix: drop both global unique constraints, replace with company-scoped
-- ones (company_id, truck_name) / (company_id, trailer_name). Safe by
-- construction -- since the OLD constraint already guaranteed at most one
-- row per name in the ENTIRE table, there cannot be any existing row that
-- violates the new, strictly looser per-company version.
--
-- NOT applied automatically -- run in the Supabase SQL editor.

alter table public.trucks drop constraint if exists trucks_truck_name_key;
create unique index if not exists trucks_company_truck_name_key
  on public.trucks (company_id, truck_name);
alter table public.trucks
  add constraint trucks_company_truck_name_key unique using index trucks_company_truck_name_key;

alter table public.trailers drop constraint if exists trailers_trailer_name_key;
create unique index if not exists trailers_company_trailer_name_key
  on public.trailers (company_id, trailer_name);
alter table public.trailers
  add constraint trailers_company_trailer_name_key unique using index trailers_company_trailer_name_key;
