-- Diesel Exhaust Fluid (DEF) in the products catalog, and the Musket terminals.
-- DEF is a 32.5% urea solution, specific gravity about 1.09 (ISO 22241: 1.087 to 1.093), so its API
-- gravity is slightly NEGATIVE (-1.3 to -2.0). alpha_per_f is an estimate; adjust if you have a spec sheet.
insert into public.products (product_name, display_name, product_code, button_code, hex_code, description, api_60, alpha_per_f, api_min, api_max, is_dyed, active)
select 'Diesel Exhaust Fluid (DEF)', 'DEF', 'DEF', 'DEF', '#38bdf8', '32.5% urea solution, not a fuel', -1.7, 0.00026, -2.04, -1.31, false, true
where not exists (select 1 from public.products where product_code = 'DEF' or product_name ilike 'Diesel Exhaust Fluid%');

insert into public.terminals (city_id, terminal_name, city, state, timezone, active, renewal_days)
select 'f1ddd170-a14d-459d-8d0f-0a5ca92e26ed', 'Musket Circle K (MCK)', 'Jacksonville', 'FL', 'America/New_York', true, 90
where not exists (select 1 from public.terminals where city_id = 'f1ddd170-a14d-459d-8d0f-0a5ca92e26ed' and terminal_name ilike 'Musket%');

insert into public.terminals (city_id, terminal_name, city, state, timezone, active, renewal_days)
select 'a83aae63-02d4-4894-a11c-4534c3bee09b', 'Musket Orlando', 'Orlando', 'FL', 'America/New_York', true, 90
where not exists (select 1 from public.terminals where city_id = 'a83aae63-02d4-4894-a11c-4534c3bee09b' and terminal_name ilike 'Musket%');
