-- Which of the company's regions a delivery location sits in. Park Preloaded
-- defaults to the destination's region, so a load parked far from its home
-- region shows up with the region that will deliver it.
alter table public.delivery_locations add column if not exists region text;
