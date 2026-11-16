-- Site notes: who last edited a drop site's notes and when (terminal notes already carry updated_by / updated_at in
-- terminal_notes). The SOP lines above the Begin buttons in the arrival windows are company settings.
alter table public.delivery_locations add column if not exists notes_updated_by uuid;
alter table public.delivery_locations add column if not exists notes_updated_at timestamptz;
alter table public.trip_settings add column if not exists sop_terminal_begin text;
alter table public.trip_settings add column if not exists sop_drop_begin text;
