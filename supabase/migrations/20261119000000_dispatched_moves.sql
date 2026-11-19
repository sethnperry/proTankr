-- Dispatched moves: dispatch (or a driver planning the day) lines up bobtail moves, empty moves, trailer hooks and trailer
-- drops the same way loads are dispatched. They live in empty_moves, so the phone's offline store already syncs them.
-- A move with dispatched = true has not begun; beginning it flips that off and stamps the real start. Hook and drop are
-- instant: they begin and end at the same moment.

alter table public.empty_moves add column if not exists dispatched boolean not null default false;
alter table public.empty_moves add column if not exists planned_start_at timestamptz;
alter table public.empty_moves add column if not exists dispatched_by uuid;
alter table public.empty_moves add column if not exists dispatch_seq integer;
alter table public.empty_moves add column if not exists planned_note text;

-- hook = couple to the trailer at a place; drop = leave the trailer at a place.
alter table public.empty_moves drop constraint if exists empty_moves_kind_check;
alter table public.empty_moves add constraint empty_moves_kind_check check (kind in ('bobtail', 'empty_return', 'reposition', 'hook', 'drop'));

-- One open move per driver means one that has begun; any number can be waiting.
drop index if exists public.empty_moves_one_open_per_driver;
create unique index if not exists empty_moves_one_open_per_driver on public.empty_moves (driver_id) where ended_at is null and dispatched = false;

-- Staff may plan a move for a driver in their company; the driver may plan their own.
drop policy if exists empty_moves_insert on public.empty_moves;
create policy empty_moves_insert on public.empty_moves for insert
  with check ((driver_id = auth.uid() and public.is_company_member(company_id)) or (public.is_company_staff(company_id) and dispatched = true));
