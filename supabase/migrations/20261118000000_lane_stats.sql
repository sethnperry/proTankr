-- Lane statistics shared across companies: how long a lane (terminal -> store, or city -> city) usually takes, and
-- its usual road miles when odometer readings exist at both ends. No company or driver ids are stored; place keys
-- are opaque ids and the city level is the part other companies' trips actually feed.
-- Server only (RLS on, no policies): written and read by the Weekly Recap through the service role.

create table if not exists public.lane_stats (
  level        text not null check (level in ('place','city')),
  lane_key     text not null,
  kind         text not null check (kind in ('loaded','empty')),
  from_label   text,
  to_label     text,
  trips        integer not null default 0,
  mean_minutes numeric not null default 0,
  m2_minutes   numeric not null default 0,   -- Welford running sum of squares (spread = sqrt(m2 / (trips - 1)))
  miles_n      integer not null default 0,
  mean_miles   numeric,
  updated_at   timestamptz not null default now(),
  primary key (level, lane_key, kind)
);
alter table public.lane_stats enable row level security;

-- One row per leg already counted, so a trip is never counted twice however often the recap runs.
create table if not exists public.lane_stat_legs (
  leg_id     text primary key,
  created_at timestamptz not null default now()
);
alter table public.lane_stat_legs enable row level security;

create or replace function public.lane_stats_add(
  p_leg_id text, p_level text, p_lane_key text, p_kind text,
  p_from_label text, p_to_label text, p_minutes numeric, p_miles numeric
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  insert into lane_stat_legs (leg_id) values (p_leg_id) on conflict do nothing;
  get diagnostics v_new = row_count;
  if not v_new then return false; end if;
  insert into lane_stats (level, lane_key, kind, from_label, to_label, trips, mean_minutes, m2_minutes, miles_n, mean_miles)
  values (p_level, p_lane_key, p_kind, p_from_label, p_to_label, 1, p_minutes, 0,
          case when p_miles is null then 0 else 1 end, p_miles)
  on conflict (level, lane_key, kind) do update set
    trips        = lane_stats.trips + 1,
    mean_minutes = lane_stats.mean_minutes + (p_minutes - lane_stats.mean_minutes) / (lane_stats.trips + 1),
    m2_minutes   = lane_stats.m2_minutes + (p_minutes - lane_stats.mean_minutes)
                   * (p_minutes - (lane_stats.mean_minutes + (p_minutes - lane_stats.mean_minutes) / (lane_stats.trips + 1))),
    miles_n      = lane_stats.miles_n + case when p_miles is null then 0 else 1 end,
    mean_miles   = case when p_miles is null then lane_stats.mean_miles
                        when lane_stats.miles_n = 0 then p_miles
                        else lane_stats.mean_miles + (p_miles - lane_stats.mean_miles) / (lane_stats.miles_n + 1) end,
    updated_at   = now();
  return true;
end $$;
revoke all on function public.lane_stats_add(text,text,text,text,text,text,numeric,numeric) from public, anon, authenticated;
