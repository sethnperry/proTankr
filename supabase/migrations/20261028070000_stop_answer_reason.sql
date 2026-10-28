-- The reason for a "No" on "Did you load here?", picked from a follow-up notification, and when
-- the terminal report it produced was posted.
alter table public.stop_answers add column if not exists reason text;
alter table public.stop_answers add column if not exists report_posted_at timestamptz;
