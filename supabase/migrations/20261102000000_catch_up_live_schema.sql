-- Catch-up: tables that exist in the live database but were never created by a migration in this repo
-- (they were made in the Supabase SQL editor). Generated from the live catalogs on 2026-11-02 so a fresh
-- database matches production. Everything is guarded (if not exists / drop-then-create for policies), so
-- running it against the live database changes nothing.

create table if not exists public."attachments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "entity_type" text not null,
  "entity_id" text not null,
  "label" text not null,
  "storage_path" text not null,
  "file_name" text not null,
  "uploaded_by" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."company_invites" (
  "invite_id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "code" text not null,
  "role" text default 'driver'::text not null,
  "created_by" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "expires_at" timestamp with time zone,
  "max_uses" integer,
  "uses_count" integer default 0 not null,
  "is_active" boolean default true not null
);

create table if not exists public."driver_licenses" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "company_id" uuid not null,
  "license_class" text,
  "license_number" text,
  "state_code" character(2),
  "endorsements" text[] default '{}'::text[] not null,
  "restrictions" text[] default '{}'::text[] not null,
  "issue_date" date,
  "expiration_date" date,
  "updated_at" timestamp with time zone default now(),
  "hazmat_linked_to_license" boolean default false not null,
  "hazmat_issue_date" date,
  "hazmat_expiration_date" date,
  "image_path" text,
  "image_back_path" text
);

create table if not exists public."driver_medical_cards" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "company_id" uuid not null,
  "issue_date" date,
  "expiration_date" date,
  "examiner_name" text,
  "updated_at" timestamp with time zone default now(),
  "attached_to_license" boolean default false not null,
  "image_path" text,
  "image_back_path" text
);

create table if not exists public."driver_port_ids" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "company_id" uuid not null,
  "port_name" text not null,
  "expiration_date" date,
  "updated_at" timestamp with time zone default now(),
  "category" text,
  "image_path" text,
  "image_back_path" text
);

create table if not exists public."driver_twic_cards" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "company_id" uuid not null,
  "card_number" text,
  "issue_date" date,
  "expiration_date" date,
  "updated_at" timestamp with time zone default now(),
  "image_path" text,
  "image_back_path" text
);

create table if not exists public."equipment_attachments" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "equipment_type" text not null,
  "equipment_id" uuid not null,
  "category" text not null,
  "category_label" text not null,
  "file_path" text not null,
  "original_name" text not null,
  "mime_type" text default 'application/octet-stream'::text not null,
  "page_order" integer default 0 not null,
  "uploaded_at" timestamp with time zone default now() not null,
  "permit_type_id" uuid,
  "uploaded_by" uuid
);

create table if not exists public."pending_invites" (
  "email" text not null,
  "company_id" uuid not null,
  "role" text default 'driver'::text not null,
  "invited_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."super_admins" (
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."terminal_sourcing_numbers" (
  "id" uuid default gen_random_uuid() not null,
  "company_id" uuid not null,
  "terminal_id" uuid not null,
  "account" text default ''::text not null,
  "number" text default ''::text not null,
  "created_by" uuid,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."terminal_temp_bias" (
  "terminal_id" uuid not null,
  "hour_of_day" integer not null,
  "month_of_year" integer not null,
  "sample_count" integer default 0,
  "mean_error" double precision,
  "m2" double precision default 0,
  "updated_at" timestamp with time zone default now()
);

create table if not exists public."truck_other_permits" (
  "permit_id" uuid default gen_random_uuid() not null,
  "truck_id" uuid not null,
  "company_id" uuid not null,
  "label" text not null,
  "expiration_date" date,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."user_settings" (
  "user_id" uuid not null,
  "active_company_id" uuid,
  "updated_at" timestamp with time zone default now() not null,
  "current_truck_id" uuid,
  "current_trailer_id" uuid
);

create table if not exists public."user_terminal_cards" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "terminal_id" text not null,
  "card_number" text default ''::text not null,
  "private_note" text default ''::text not null,
  "updated_at" timestamp with time zone default now() not null,
  "pin" text
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attachments_pkey' and conrelid = 'public."attachments"'::regclass) then
    alter table public."attachments" add constraint "attachments_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attachments_company_id_fkey' and conrelid = 'public."attachments"'::regclass) then
    alter table public."attachments" add constraint "attachments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attachments_uploaded_by_fkey' and conrelid = 'public."attachments"'::regclass) then
    alter table public."attachments" add constraint "attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments USING btree (company_id, entity_type, entity_id);

alter table public."attachments" enable row level security;

drop policy if exists "Company members can insert attachments" on public."attachments";
create policy "Company members can insert attachments" on public."attachments" as permissive for insert to public with check ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = attachments.company_id)))));
drop policy if exists "Company members can read attachments" on public."attachments";
create policy "Company members can read attachments" on public."attachments" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = attachments.company_id)))));
drop policy if exists "Uploader or admin can delete attachments" on public."attachments";
create policy "Uploader or admin can delete attachments" on public."attachments" as permissive for delete to public using (((uploaded_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = attachments.company_id) AND (user_companies.role = 'admin'::text))))));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_invites_code_key' and conrelid = 'public."company_invites"'::regclass) then
    alter table public."company_invites" add constraint "company_invites_code_key" UNIQUE (code);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_invites_pkey' and conrelid = 'public."company_invites"'::regclass) then
    alter table public."company_invites" add constraint "company_invites_pkey" PRIMARY KEY (invite_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_invites_company_id_fkey' and conrelid = 'public."company_invites"'::regclass) then
    alter table public."company_invites" add constraint "company_invites_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_invites_created_by_fkey' and conrelid = 'public."company_invites"'::regclass) then
    alter table public."company_invites" add constraint "company_invites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS company_invites_company_id_idx ON public.company_invites USING btree (company_id);

CREATE INDEX IF NOT EXISTS company_invites_code_idx ON public.company_invites USING btree (code);

CREATE INDEX IF NOT EXISTS company_invites_is_active_idx ON public.company_invites USING btree (is_active);

alter table public."company_invites" enable row level security;

drop policy if exists "company_invites_delete_admin_or_super" on public."company_invites";
create policy "company_invites_delete_admin_or_super" on public."company_invites" as permissive for delete to authenticated using (is_company_admin(company_id));
drop policy if exists "company_invites_insert_admin_or_super" on public."company_invites";
create policy "company_invites_insert_admin_or_super" on public."company_invites" as permissive for insert to authenticated with check ((is_company_admin(company_id) AND (created_by = auth.uid())));
drop policy if exists "company_invites_select_admin_or_super" on public."company_invites";
create policy "company_invites_select_admin_or_super" on public."company_invites" as permissive for select to authenticated using (is_company_admin(company_id));
drop policy if exists "company_invites_update_admin_or_super" on public."company_invites";
create policy "company_invites_update_admin_or_super" on public."company_invites" as permissive for update to authenticated using (is_company_admin(company_id)) with check (is_company_admin(company_id));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_licenses_pkey' and conrelid = 'public."driver_licenses"'::regclass) then
    alter table public."driver_licenses" add constraint "driver_licenses_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_licenses_user_id_company_id_key' and conrelid = 'public."driver_licenses"'::regclass) then
    alter table public."driver_licenses" add constraint "driver_licenses_user_id_company_id_key" UNIQUE (user_id, company_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_licenses_company_id_fkey' and conrelid = 'public."driver_licenses"'::regclass) then
    alter table public."driver_licenses" add constraint "driver_licenses_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_licenses_user_id_fkey' and conrelid = 'public."driver_licenses"'::regclass) then
    alter table public."driver_licenses" add constraint "driver_licenses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."driver_licenses" enable row level security;

drop policy if exists "dl_admin" on public."driver_licenses";
create policy "dl_admin" on public."driver_licenses" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_licenses.company_id) AND (user_companies.role = 'admin'::text)))));
drop policy if exists "dl_admin_dispatch_read" on public."driver_licenses";
create policy "dl_admin_dispatch_read" on public."driver_licenses" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = driver_licenses.company_id) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text]))))));
drop policy if exists "dl_dispatch_write" on public."driver_licenses";
create policy "dl_dispatch_write" on public."driver_licenses" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_licenses.company_id) AND (user_companies.role = 'dispatch'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_licenses.company_id) AND (user_companies.role = 'dispatch'::text)))));
drop policy if exists "dl_own" on public."driver_licenses";
create policy "dl_own" on public."driver_licenses" as permissive for select to authenticated using ((user_id = auth.uid()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_medical_cards_pkey' and conrelid = 'public."driver_medical_cards"'::regclass) then
    alter table public."driver_medical_cards" add constraint "driver_medical_cards_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_medical_cards_user_id_company_id_key' and conrelid = 'public."driver_medical_cards"'::regclass) then
    alter table public."driver_medical_cards" add constraint "driver_medical_cards_user_id_company_id_key" UNIQUE (user_id, company_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_medical_cards_company_id_fkey' and conrelid = 'public."driver_medical_cards"'::regclass) then
    alter table public."driver_medical_cards" add constraint "driver_medical_cards_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_medical_cards_user_id_fkey' and conrelid = 'public."driver_medical_cards"'::regclass) then
    alter table public."driver_medical_cards" add constraint "driver_medical_cards_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."driver_medical_cards" enable row level security;

drop policy if exists "dmc_admin" on public."driver_medical_cards";
create policy "dmc_admin" on public."driver_medical_cards" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_medical_cards.company_id) AND (user_companies.role = 'admin'::text)))));
drop policy if exists "dmc_admin_dispatch_read" on public."driver_medical_cards";
create policy "dmc_admin_dispatch_read" on public."driver_medical_cards" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = driver_medical_cards.company_id) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text]))))));
drop policy if exists "dmc_dispatch_write" on public."driver_medical_cards";
create policy "dmc_dispatch_write" on public."driver_medical_cards" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_medical_cards.company_id) AND (user_companies.role = 'dispatch'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_medical_cards.company_id) AND (user_companies.role = 'dispatch'::text)))));
drop policy if exists "dmc_own" on public."driver_medical_cards";
create policy "dmc_own" on public."driver_medical_cards" as permissive for select to authenticated using ((user_id = auth.uid()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_port_ids_pkey' and conrelid = 'public."driver_port_ids"'::regclass) then
    alter table public."driver_port_ids" add constraint "driver_port_ids_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_port_ids_company_id_fkey' and conrelid = 'public."driver_port_ids"'::regclass) then
    alter table public."driver_port_ids" add constraint "driver_port_ids_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_port_ids_user_id_fkey' and conrelid = 'public."driver_port_ids"'::regclass) then
    alter table public."driver_port_ids" add constraint "driver_port_ids_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."driver_port_ids" enable row level security;

drop policy if exists "dpid_admin" on public."driver_port_ids";
create policy "dpid_admin" on public."driver_port_ids" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_port_ids.company_id) AND (user_companies.role = 'admin'::text)))));
drop policy if exists "dpid_admin_dispatch_read" on public."driver_port_ids";
create policy "dpid_admin_dispatch_read" on public."driver_port_ids" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = driver_port_ids.company_id) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text]))))));
drop policy if exists "dpid_dispatch_write" on public."driver_port_ids";
create policy "dpid_dispatch_write" on public."driver_port_ids" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_port_ids.company_id) AND (user_companies.role = 'dispatch'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_port_ids.company_id) AND (user_companies.role = 'dispatch'::text)))));
drop policy if exists "dpid_own" on public."driver_port_ids";
create policy "dpid_own" on public."driver_port_ids" as permissive for select to authenticated using ((user_id = auth.uid()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_twic_cards_pkey' and conrelid = 'public."driver_twic_cards"'::regclass) then
    alter table public."driver_twic_cards" add constraint "driver_twic_cards_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_twic_cards_user_id_company_id_key' and conrelid = 'public."driver_twic_cards"'::regclass) then
    alter table public."driver_twic_cards" add constraint "driver_twic_cards_user_id_company_id_key" UNIQUE (user_id, company_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_twic_cards_company_id_fkey' and conrelid = 'public."driver_twic_cards"'::regclass) then
    alter table public."driver_twic_cards" add constraint "driver_twic_cards_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'driver_twic_cards_user_id_fkey' and conrelid = 'public."driver_twic_cards"'::regclass) then
    alter table public."driver_twic_cards" add constraint "driver_twic_cards_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."driver_twic_cards" enable row level security;

drop policy if exists "dtc_admin" on public."driver_twic_cards";
create policy "dtc_admin" on public."driver_twic_cards" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_twic_cards.company_id) AND (user_companies.role = 'admin'::text)))));
drop policy if exists "dtc_admin_dispatch_read" on public."driver_twic_cards";
create policy "dtc_admin_dispatch_read" on public."driver_twic_cards" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = driver_twic_cards.company_id) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text]))))));
drop policy if exists "dtc_dispatch_write" on public."driver_twic_cards";
create policy "dtc_dispatch_write" on public."driver_twic_cards" as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_twic_cards.company_id) AND (user_companies.role = 'dispatch'::text))))) with check ((EXISTS ( SELECT 1
   FROM user_companies
  WHERE ((user_companies.user_id = auth.uid()) AND (user_companies.company_id = driver_twic_cards.company_id) AND (user_companies.role = 'dispatch'::text)))));
drop policy if exists "dtc_own" on public."driver_twic_cards";
create policy "dtc_own" on public."driver_twic_cards" as permissive for select to authenticated using ((user_id = auth.uid()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_attachments_equipment_type_check' and conrelid = 'public."equipment_attachments"'::regclass) then
    alter table public."equipment_attachments" add constraint "equipment_attachments_equipment_type_check" CHECK ((equipment_type = ANY (ARRAY['truck'::text, 'trailer'::text])));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_attachments_pkey' and conrelid = 'public."equipment_attachments"'::regclass) then
    alter table public."equipment_attachments" add constraint "equipment_attachments_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_attachments_company_id_fkey' and conrelid = 'public."equipment_attachments"'::regclass) then
    alter table public."equipment_attachments" add constraint "equipment_attachments_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_attachments_permit_type_id_fkey' and conrelid = 'public."equipment_attachments"'::regclass) then
    alter table public."equipment_attachments" add constraint "equipment_attachments_permit_type_id_fkey" FOREIGN KEY (permit_type_id) REFERENCES permit_types(permit_type_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'equipment_attachments_uploaded_by_fkey' and conrelid = 'public."equipment_attachments"'::regclass) then
    alter table public."equipment_attachments" add constraint "equipment_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
  end if;
end $$;

CREATE INDEX IF NOT EXISTS equipment_attachments_equipment_idx ON public.equipment_attachments USING btree (company_id, equipment_type, equipment_id);

CREATE INDEX IF NOT EXISTS equipment_attachments_category_idx ON public.equipment_attachments USING btree (company_id, equipment_type, equipment_id, category);

alter table public."equipment_attachments" enable row level security;

drop policy if exists "company members can delete attachments" on public."equipment_attachments";
create policy "company members can delete attachments" on public."equipment_attachments" as permissive for delete to public using ((company_id IN ( SELECT user_companies.company_id
   FROM user_companies
  WHERE (user_companies.user_id = auth.uid()))));
drop policy if exists "company members can insert attachments" on public."equipment_attachments";
create policy "company members can insert attachments" on public."equipment_attachments" as permissive for insert to public with check ((company_id IN ( SELECT user_companies.company_id
   FROM user_companies
  WHERE (user_companies.user_id = auth.uid()))));
drop policy if exists "company members can read attachments" on public."equipment_attachments";
create policy "company members can read attachments" on public."equipment_attachments" as permissive for select to public using ((company_id IN ( SELECT user_companies.company_id
   FROM user_companies
  WHERE (user_companies.user_id = auth.uid()))));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pending_invites_pkey' and conrelid = 'public."pending_invites"'::regclass) then
    alter table public."pending_invites" add constraint "pending_invites_pkey" PRIMARY KEY (email, company_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pending_invites_company_id_fkey' and conrelid = 'public."pending_invites"'::regclass) then
    alter table public."pending_invites" add constraint "pending_invites_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pending_invites_invited_by_fkey' and conrelid = 'public."pending_invites"'::regclass) then
    alter table public."pending_invites" add constraint "pending_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;

alter table public."pending_invites" enable row level security;

drop policy if exists "pending_invites_select_own" on public."pending_invites";
create policy "pending_invites_select_own" on public."pending_invites" as permissive for select to authenticated using ((email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'super_admins_pkey' and conrelid = 'public."super_admins"'::regclass) then
    alter table public."super_admins" add constraint "super_admins_pkey" PRIMARY KEY (user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'super_admins_user_id_fkey' and conrelid = 'public."super_admins"'::regclass) then
    alter table public."super_admins" add constraint "super_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."super_admins" enable row level security;

drop policy if exists "super_admins_select_super" on public."super_admins";
create policy "super_admins_select_super" on public."super_admins" as permissive for select to authenticated using (is_super_admin());
drop policy if exists "super_admins_write_super" on public."super_admins";
create policy "super_admins_write_super" on public."super_admins" as permissive for all to authenticated using (is_super_admin()) with check (is_super_admin());

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'terminal_sourcing_numbers_pkey' and conrelid = 'public."terminal_sourcing_numbers"'::regclass) then
    alter table public."terminal_sourcing_numbers" add constraint "terminal_sourcing_numbers_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'terminal_sourcing_numbers_created_by_fkey' and conrelid = 'public."terminal_sourcing_numbers"'::regclass) then
    alter table public."terminal_sourcing_numbers" add constraint "terminal_sourcing_numbers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
  end if;
end $$;

alter table public."terminal_sourcing_numbers" enable row level security;

drop policy if exists "company members can read sourcing numbers" on public."terminal_sourcing_numbers";
create policy "company members can read sourcing numbers" on public."terminal_sourcing_numbers" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_settings us ON ((us.user_id = uc.user_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = terminal_sourcing_numbers.company_id) AND (us.active_company_id = terminal_sourcing_numbers.company_id)))));
drop policy if exists "leads and admins can write sourcing numbers" on public."terminal_sourcing_numbers";
create policy "leads and admins can write sourcing numbers" on public."terminal_sourcing_numbers" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_settings us ON ((us.user_id = uc.user_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = terminal_sourcing_numbers.company_id) AND (us.active_company_id = terminal_sourcing_numbers.company_id) AND (uc.role = ANY (ARRAY['admin'::text, 'lead'::text]))))));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'terminal_temp_bias_pkey' and conrelid = 'public."terminal_temp_bias"'::regclass) then
    alter table public."terminal_temp_bias" add constraint "terminal_temp_bias_pkey" PRIMARY KEY (terminal_id, hour_of_day, month_of_year);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'terminal_temp_bias_terminal_id_fkey' and conrelid = 'public."terminal_temp_bias"'::regclass) then
    alter table public."terminal_temp_bias" add constraint "terminal_temp_bias_terminal_id_fkey" FOREIGN KEY (terminal_id) REFERENCES terminals(terminal_id);
  end if;
end $$;

alter table public."terminal_temp_bias" enable row level security;

drop policy if exists "terminal_temp_bias_read" on public."terminal_temp_bias";
create policy "terminal_temp_bias_read" on public."terminal_temp_bias" as permissive for select to authenticated using (true);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'truck_other_permits_pkey' and conrelid = 'public."truck_other_permits"'::regclass) then
    alter table public."truck_other_permits" add constraint "truck_other_permits_pkey" PRIMARY KEY (permit_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'truck_other_permits_company_id_fkey' and conrelid = 'public."truck_other_permits"'::regclass) then
    alter table public."truck_other_permits" add constraint "truck_other_permits_company_id_fkey" FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'truck_other_permits_truck_id_fkey' and conrelid = 'public."truck_other_permits"'::regclass) then
    alter table public."truck_other_permits" add constraint "truck_other_permits_truck_id_fkey" FOREIGN KEY (truck_id) REFERENCES trucks(truck_id) ON DELETE CASCADE;
  end if;
end $$;

alter table public."truck_other_permits" enable row level security;

drop policy if exists "other_permits_delete_own_company" on public."truck_other_permits";
create policy "other_permits_delete_own_company" on public."truck_other_permits" as permissive for delete to public using ((company_id = get_active_company_id()));
drop policy if exists "other_permits_insert_own_company" on public."truck_other_permits";
create policy "other_permits_insert_own_company" on public."truck_other_permits" as permissive for insert to public with check ((company_id = get_active_company_id()));
drop policy if exists "other_permits_select_own_company" on public."truck_other_permits";
create policy "other_permits_select_own_company" on public."truck_other_permits" as permissive for select to public using ((company_id = get_active_company_id()));
drop policy if exists "other_permits_update_own_company" on public."truck_other_permits";
create policy "other_permits_update_own_company" on public."truck_other_permits" as permissive for update to public using ((company_id = get_active_company_id()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_pkey' and conrelid = 'public."user_settings"'::regclass) then
    alter table public."user_settings" add constraint "user_settings_pkey" PRIMARY KEY (user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_active_company_id_fkey' and conrelid = 'public."user_settings"'::regclass) then
    alter table public."user_settings" add constraint "user_settings_active_company_id_fkey" FOREIGN KEY (active_company_id) REFERENCES companies(company_id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_user_id_fkey' and conrelid = 'public."user_settings"'::regclass) then
    alter table public."user_settings" add constraint "user_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS user_settings_active_company_id_idx ON public.user_settings USING btree (active_company_id);

alter table public."user_settings" enable row level security;

drop policy if exists "user_settings_insert_own" on public."user_settings";
create policy "user_settings_insert_own" on public."user_settings" as permissive for insert to authenticated with check ((user_id = auth.uid()));
drop policy if exists "user_settings_insert_self" on public."user_settings";
create policy "user_settings_insert_self" on public."user_settings" as permissive for insert to authenticated with check (((user_id = auth.uid()) AND ((active_company_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = user_settings.active_company_id)))))));
drop policy if exists "user_settings_select_own" on public."user_settings";
create policy "user_settings_select_own" on public."user_settings" as permissive for select to authenticated using ((user_id = auth.uid()));
drop policy if exists "user_settings_update_own" on public."user_settings";
create policy "user_settings_update_own" on public."user_settings" as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
drop policy if exists "user_settings_update_self" on public."user_settings";
create policy "user_settings_update_self" on public."user_settings" as permissive for update to authenticated using (((user_id = auth.uid()) OR is_super_admin())) with check ((((user_id = auth.uid()) OR is_super_admin()) AND ((active_company_id IS NULL) OR (EXISTS ( SELECT 1
   FROM user_companies uc
  WHERE ((uc.user_id = auth.uid()) AND (uc.company_id = user_settings.active_company_id)))))));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_terminal_cards_pkey' and conrelid = 'public."user_terminal_cards"'::regclass) then
    alter table public."user_terminal_cards" add constraint "user_terminal_cards_pkey" PRIMARY KEY (id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_terminal_cards_user_id_terminal_id_key' and conrelid = 'public."user_terminal_cards"'::regclass) then
    alter table public."user_terminal_cards" add constraint "user_terminal_cards_user_id_terminal_id_key" UNIQUE (user_id, terminal_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_terminal_cards_user_id_fkey' and conrelid = 'public."user_terminal_cards"'::regclass) then
    alter table public."user_terminal_cards" add constraint "user_terminal_cards_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

CREATE INDEX IF NOT EXISTS user_terminal_cards_user_idx ON public.user_terminal_cards USING btree (user_id);

alter table public."user_terminal_cards" enable row level security;

drop policy if exists "owner_delete" on public."user_terminal_cards";
create policy "owner_delete" on public."user_terminal_cards" as permissive for delete to public using ((auth.uid() = user_id));
drop policy if exists "owner_insert" on public."user_terminal_cards";
create policy "owner_insert" on public."user_terminal_cards" as permissive for insert to public with check ((auth.uid() = user_id));
drop policy if exists "owner_select" on public."user_terminal_cards";
create policy "owner_select" on public."user_terminal_cards" as permissive for select to public using ((auth.uid() = user_id));
drop policy if exists "owner_update" on public."user_terminal_cards";
create policy "owner_update" on public."user_terminal_cards" as permissive for update to public using ((auth.uid() = user_id));
drop policy if exists "user_terminal_cards_admin_dispatch_delete" on public."user_terminal_cards";
create policy "user_terminal_cards_admin_dispatch_delete" on public."user_terminal_cards" as permissive for delete to authenticated using ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_companies uc2 ON ((uc2.company_id = uc.company_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text])) AND (uc2.user_id = user_terminal_cards.user_id)))));
drop policy if exists "user_terminal_cards_admin_dispatch_insert" on public."user_terminal_cards";
create policy "user_terminal_cards_admin_dispatch_insert" on public."user_terminal_cards" as permissive for insert to authenticated with check ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_companies uc2 ON ((uc2.company_id = uc.company_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text])) AND (uc2.user_id = user_terminal_cards.user_id)))));
drop policy if exists "user_terminal_cards_admin_dispatch_read" on public."user_terminal_cards";
create policy "user_terminal_cards_admin_dispatch_read" on public."user_terminal_cards" as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_companies uc2 ON ((uc2.company_id = uc.company_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text])) AND (uc2.user_id = user_terminal_cards.user_id)))));
drop policy if exists "user_terminal_cards_admin_dispatch_update" on public."user_terminal_cards";
create policy "user_terminal_cards_admin_dispatch_update" on public."user_terminal_cards" as permissive for update to authenticated using ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_companies uc2 ON ((uc2.company_id = uc.company_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text])) AND (uc2.user_id = user_terminal_cards.user_id))))) with check ((EXISTS ( SELECT 1
   FROM (user_companies uc
     JOIN user_companies uc2 ON ((uc2.company_id = uc.company_id)))
  WHERE ((uc.user_id = auth.uid()) AND (uc.role = ANY (ARRAY['admin'::text, 'dispatch'::text])) AND (uc2.user_id = user_terminal_cards.user_id)))));
