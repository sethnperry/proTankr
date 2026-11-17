-- A driver the tracker shows in a truck with a trailer the app has never paired with it: no combo can exist without a tare.
-- The handoff waits for the driver to enter it (a notification and a window on the dashboard).
alter table public.equipment_handoffs add column if not exists needs_tare boolean not null default false;
alter table public.equipment_handoffs add column if not exists notified_at timestamptz;
