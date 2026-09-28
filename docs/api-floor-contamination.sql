-- API floor contamination check / repair (2026-09-28)
--
-- Background: before today's fix, Log the Load's API field was prefilled with
-- the product's published minimum (products.api_min) whenever a rack had no
-- reading yet. A tap-through wrote that value as a real observation, and
-- rack_product_status.min_api_observed keeps the lowest value ever written,
-- so the terminal's "floor" got pinned to product min. Stale plans there then
-- fall to product min instead of the terminal's real history.
--
-- Run PART 1 first (read-only). PART 2 changes data -- read its note first.

-- ── PART 1: Kinder Morgan / Tampa, every product on every rack ─────────────
select t.terminal_name, r.rack_name, p.product_name,
       rps.last_api, rps.last_temp_f, rps.min_api_observed, rps.updated_at,
       p.api_min, p.api_60,
       (rps.min_api_observed = p.api_min) as floor_equals_product_min
  from rack_product_status rps
  join terminal_racks r on r.rack_id = rps.rack_id
  join terminals t on t.terminal_id = r.terminal_id
  join products p on p.product_id = rps.product_id
 where t.terminal_name ilike '%kinder%' and t.city ilike 'tampa%'
 order by r.rack_name, p.product_name;

-- ── PART 1b: every rack that looks contaminated ────────────────────────────
-- floor exactly equals product min, but the latest real reading is lighter.
-- (A floor that genuinely equals product min is possible, so review these,
-- don't assume every row is bad.)
select t.terminal_name, t.city, r.rack_name, p.product_name,
       rps.min_api_observed, rps.last_api, p.api_min, rps.updated_at
  from rack_product_status rps
  join terminal_racks r on r.rack_id = rps.rack_id
  join terminals t on t.terminal_id = r.terminal_id
  join products p on p.product_id = rps.product_id
 where rps.min_api_observed = p.api_min
   and rps.last_api is not null
   and rps.last_api > p.api_min
 order by t.terminal_name, r.rack_name, p.product_name;

-- ── PART 2 (changes data): reset those floors to the last real reading ─────
-- Sets min_api_observed = last_api for the rows PART 1b listed. From then on
-- it folds in normally with each new load. Loses nothing real: the product-
-- min value it replaces was never an observed reading.
--
-- update rack_product_status rps
--    set min_api_observed = rps.last_api
--   from products p
--  where p.product_id = rps.product_id
--    and rps.min_api_observed = p.api_min
--    and rps.last_api is not null
--    and rps.last_api > p.api_min;
