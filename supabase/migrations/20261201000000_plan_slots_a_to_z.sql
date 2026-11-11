-- Saved plans go from A-E (slots 1-5) to A-Z (slots 1-26).
-- user_plan_slots keeps slot 0 (autosave); trailer_plan_slots (set by dispatch/lead/admin) starts at 1.
alter table public.user_plan_slots drop constraint if exists user_plan_slots_slot_check;
alter table public.user_plan_slots add constraint user_plan_slots_slot_check check (slot >= 0 and slot <= 26);

alter table public.trailer_plan_slots drop constraint if exists trailer_plan_slots_slot_check;
alter table public.trailer_plan_slots add constraint trailer_plan_slots_slot_check check (slot between 1 and 26);
