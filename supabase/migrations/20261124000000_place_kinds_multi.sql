-- A place can be several kinds at once (a yard that is also a fuel stop). place_kind stays as the first/primary kind.
alter table public.delivery_locations add column if not exists place_kinds text[];
update public.delivery_locations set place_kinds = array[place_kind] where place_kinds is null;
