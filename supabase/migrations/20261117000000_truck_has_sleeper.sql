-- A sleeper cab: at End shift the driver is asked whether they're staying in the truck. Day cabs aren't asked that.
alter table public.trucks add column if not exists has_sleeper boolean not null default false;
