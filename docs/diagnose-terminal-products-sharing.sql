-- Diagnostic only -- run in the Supabase SQL editor, read-only, nothing here
-- writes anything. Swap in the terminal name (and city if you know it) you
-- tested with.

-- 1) Is there more than one terminal row matching this name? If so, the two
--    company sessions may simply have picked different rows.
select terminal_id, terminal_name, city, state, active, created_at
from terminals
where terminal_name ilike '%PUT_TERMINAL_NAME_HERE%'
order by created_at;

-- 2) For each matching terminal, how many racks does it have, and what are
--    their ids/names? A genuinely single-rack terminal should show exactly
--    one row per terminal_id here.
select r.terminal_id, r.rack_id, r.rack_name, r.created_at
from terminal_racks r
join terminals t on t.terminal_id = r.terminal_id
where t.terminal_name ilike '%PUT_TERMINAL_NAME_HERE%'
order by r.terminal_id, r.created_at;

-- 3) What products are actually curated on each of those racks? If step 1
--    found only one terminal row but this still comes back empty for a
--    rack you expect to have products, the bug is elsewhere (rack
--    resolution in the app, not duplicate data) and needs a different
--    look than what this query can show.
select rps.rack_id, rps.product_id, p.product_name, rps.active, rps.updated_at
from rack_product_status rps
join terminal_racks r on r.rack_id = rps.rack_id
join terminals t on t.terminal_id = r.terminal_id
join products p on p.product_id = rps.product_id
where t.terminal_name ilike '%PUT_TERMINAL_NAME_HERE%'
order by rps.rack_id, p.product_name;
