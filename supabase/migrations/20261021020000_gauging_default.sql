-- Gauging default: terminals gauge from 11:30 PM and are back up at midnight,
-- terminal-local time. Companies still on the old 00:00 / 60 min default move
-- to the new one; anything a company set itself is left alone.
alter table public.trip_settings alter column gauging_cutoff set default '23:30';
alter table public.trip_settings alter column gauging_minutes set default 30;
update public.trip_settings set gauging_cutoff = '23:30', gauging_minutes = 30
  where gauging_cutoff = '00:00' and gauging_minutes = 60;
