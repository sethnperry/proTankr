-- Which of the company's local areas a delivery location sits in, so dispatch
-- can browse drop locations by region / local area / city.
alter table public.delivery_locations add column if not exists local_area text;
