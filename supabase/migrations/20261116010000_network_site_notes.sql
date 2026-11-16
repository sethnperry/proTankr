-- Drop site notes shared across every company, like terminal notes: an outside carrier arriving at the store sees
-- the same gate code and where the fills are. A site is matched the same way recent deliveries are: same state,
-- name and store number, and the same city or within about two miles. Direct table access is closed; the two
-- functions below are the only way in, and the caller must belong to the company that owns the location they name.
create table if not exists public.site_notes (
  site_id uuid primary key default gen_random_uuid(),
  state text not null default '',
  norm_name text not null,
  norm_number text not null default '',
  norm_city text not null default '',
  lat double precision,
  lon double precision,
  note text not null default '',
  updated_by uuid,
  updated_company uuid,
  updated_at timestamptz not null default now()
);
create index if not exists site_notes_lookup on public.site_notes (state, norm_name, norm_number);
alter table public.site_notes enable row level security;

-- Start from the notes companies already wrote on their own locations (newest per store).
insert into public.site_notes (state, norm_name, norm_number, norm_city, lat, lon, note, updated_by, updated_company, updated_at)
select distinct on (upper(coalesce(state, '')), _norm_store_text(name), _norm_store_text(location_number), _norm_store_city(city))
  upper(coalesce(state, '')), _norm_store_text(name), coalesce(_norm_store_text(location_number), ''), coalesce(_norm_store_city(city), ''),
  lat, lon, trim(notes), notes_updated_by, company_id, coalesce(notes_updated_at, now())
from public.delivery_locations
where notes is not null and trim(notes) <> ''
  and not exists (select 1 from public.site_notes)
order by upper(coalesce(state, '')), _norm_store_text(name), _norm_store_text(location_number), _norm_store_city(city), notes_updated_at desc nulls last;

create or replace function public._site_note_id(p_location_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select n.site_id from public.site_notes n, public.delivery_locations l
   where l.location_id = p_location_id
     and n.state = upper(coalesce(l.state, ''))
     and n.norm_name = coalesce(_norm_store_text(l.name), '')
     and n.norm_number = coalesce(_norm_store_text(l.location_number), '')
     and ((n.norm_city <> '' and n.norm_city = coalesce(_norm_store_city(l.city), ''))
          or (n.lat is not null and n.lon is not null and l.lat is not null and l.lon is not null
              and abs(n.lat - l.lat) < 0.03 and abs(n.lon - l.lon) < 0.03))
   order by n.updated_at desc limit 1
$$;
revoke all on function public._site_note_id(uuid) from public, anon, authenticated;

create or replace function public.get_site_note(p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_co uuid; v_id uuid; r public.site_notes%rowtype;
begin
  select company_id into v_co from public.delivery_locations where location_id = p_location_id;
  if v_co is null or not trip_company_member(v_co) then return jsonb_build_object('note', '', 'updated_at', null, 'by', null); end if;
  v_id := public._site_note_id(p_location_id);
  if v_id is null then return jsonb_build_object('note', '', 'updated_at', null, 'by', null); end if;
  select * into r from public.site_notes where site_id = v_id;
  return jsonb_build_object('note', r.note, 'updated_at', r.updated_at,
    'by', case when r.updated_company is null then null else _short_company_name((select c.company_name from public.companies c where c.company_id = r.updated_company)) end);
end $$;

create or replace function public.set_site_note(p_location_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid; l public.delivery_locations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into l from public.delivery_locations where location_id = p_location_id;
  if not found or not trip_company_member(l.company_id) then raise exception 'Not authorized'; end if;
  v_id := public._site_note_id(p_location_id);
  if v_id is not null then
    update public.site_notes set note = coalesce(trim(p_note), ''), updated_by = auth.uid(), updated_company = l.company_id, updated_at = now() where site_id = v_id;
  else
    insert into public.site_notes (state, norm_name, norm_number, norm_city, lat, lon, note, updated_by, updated_company)
    values (upper(coalesce(l.state, '')), coalesce(_norm_store_text(l.name), ''), coalesce(_norm_store_text(l.location_number), ''), coalesce(_norm_store_city(l.city), ''), l.lat, l.lon, coalesce(trim(p_note), ''), auth.uid(), l.company_id);
  end if;
end $$;
grant execute on function public.get_site_note(uuid), public.set_site_note(uuid, text) to authenticated;
