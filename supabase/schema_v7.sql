-- PMO Console schema v7 — additive/alters schema_v2 through v6. Run this after v6.
--
-- This is the real multi-tenant rewrite: every top-level table gets an
-- owner_id, every RLS policy moves from "any authenticated user sees
-- everything" to "only the owner sees their own rows." Tables that cascade
-- from a project (milestones, risks, etc.) inherit isolation through a join
-- to projects.owner_id rather than getting their own column.
--
-- This file ALSO contains the Data Model + mapping tables (section 8). Those
-- were originally planned as a separate v8; they're merged here so there's
-- one SQL run, not two. Sections 1-7 are the multi-tenant rewrite, section 8
-- is the new Data Model feature (all new tables, owner-scoped from creation),
-- section 9 is the one-time data migration.
--
-- IMPORTANT — run the data migration at the bottom of this file for your own
-- account before anyone else logs in, or your existing projects become
-- invisible to you once these policies take effect.

-- ========== 1. Add owner_id to every directly-owned table ==========
-- default auth.uid() means the app code never has to set this explicitly —
-- Postgres fills it in from the logged-in user automatically on insert.

alter table projects add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table roles add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table sows add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table change_orders add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table sdds add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table blueprints add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table data_spec_entities add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table discovery_findings add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table integrations add column if not exists owner_id uuid references auth.users(id) default auth.uid();

-- ========== 2. app_settings becomes per-user (composite key) ==========

alter table app_settings add column if not exists owner_id uuid references auth.users(id) default auth.uid();
alter table app_settings drop constraint if exists app_settings_pkey;
-- de-dupe any pre-existing single global row before adding the new composite key,
-- in case this runs on a database that already has vendor_name/product_name set.
alter table app_settings add primary key (owner_id, key);

-- ========== 3. Admin + invite allowlist ==========

create table if not exists app_admins (
  user_id uuid primary key references auth.users(id)
);

create table if not exists allowed_emails (
  email text primary key,
  invited_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table app_admins enable row level security;
alter table allowed_emails enable row level security;

-- Anyone can check their own admin status; nobody can grant themselves admin
-- via the API (that's a manual SQL step you run once per trusted person).
create policy "read own admin row" on app_admins for select using (auth.uid() = user_id);

-- The allowlist has to be readable before login (the registration page checks
-- it pre-signup), so SELECT is open. Only admins can add or remove entries.
create policy "anyone can check allowlist" on allowed_emails for select using (true);
create policy "only admins manage allowlist" on allowed_emails for insert
  with check (exists (select 1 from app_admins where user_id = auth.uid()));
create policy "only admins remove from allowlist" on allowed_emails for delete
  using (exists (select 1 from app_admins where user_id = auth.uid()));

-- ========== 4. Drop every old "any authenticated user" policy ==========

drop policy if exists "authenticated full access" on projects;
drop policy if exists "authenticated full access" on milestones;
drop policy if exists "authenticated full access" on dependencies;
drop policy if exists "authenticated full access" on risks;
drop policy if exists "authenticated full access" on scope_items;
drop policy if exists "authenticated full access" on change_requests;
drop policy if exists "authenticated full access" on blueprints;
drop policy if exists "authenticated full access" on blueprint_phases;
drop policy if exists "authenticated full access" on closeouts;
drop policy if exists "authenticated full access" on sows;
drop policy if exists "authenticated full access" on roles;
drop policy if exists "authenticated full access" on change_orders;
drop policy if exists "authenticated full access" on app_settings;
drop policy if exists "authenticated full access" on data_spec_entities;
drop policy if exists "authenticated full access" on data_spec_fields;
drop policy if exists "authenticated full access" on sdds;
drop policy if exists "authenticated full access" on discovery_findings;
drop policy if exists "authenticated full access" on integrations;

-- ========== 5. New owner-scoped policies — direct-owner tables ==========

create policy "owner full access" on projects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on roles for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on sows for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on change_orders for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on sdds for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on blueprints for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on data_spec_entities for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on discovery_findings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on integrations for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on app_settings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ========== 6. New owner-scoped policies — cascaded through a project ==========

create policy "owner via project" on milestones for all
  using (exists (select 1 from projects where projects.id = milestones.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = milestones.project_id and projects.owner_id = auth.uid()));

create policy "owner via project" on dependencies for all
  using (exists (select 1 from projects where projects.id = dependencies.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = dependencies.project_id and projects.owner_id = auth.uid()));

create policy "owner via project" on risks for all
  using (exists (select 1 from projects where projects.id = risks.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = risks.project_id and projects.owner_id = auth.uid()));

create policy "owner via project" on scope_items for all
  using (exists (select 1 from projects where projects.id = scope_items.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = scope_items.project_id and projects.owner_id = auth.uid()));

create policy "owner via project" on change_requests for all
  using (exists (select 1 from projects where projects.id = change_requests.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = change_requests.project_id and projects.owner_id = auth.uid()));

create policy "owner via project" on closeouts for all
  using (exists (select 1 from projects where projects.id = closeouts.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = closeouts.project_id and projects.owner_id = auth.uid()));

-- ========== 7. New owner-scoped policies — cascaded through a non-project parent ==========

create policy "owner via blueprint" on blueprint_phases for all
  using (exists (select 1 from blueprints where blueprints.id = blueprint_phases.blueprint_id and blueprints.owner_id = auth.uid()))
  with check (exists (select 1 from blueprints where blueprints.id = blueprint_phases.blueprint_id and blueprints.owner_id = auth.uid()));

create policy "owner via entity" on data_spec_fields for all
  using (exists (select 1 from data_spec_entities where data_spec_entities.id = data_spec_fields.entity_id and data_spec_entities.owner_id = auth.uid()))
  with check (exists (select 1 from data_spec_entities where data_spec_entities.id = data_spec_fields.entity_id and data_spec_entities.owner_id = auth.uid()));

-- ========== 8. Data Model + mappings (new tables, owner-scoped from creation) ==========
-- A "target model" is the vendor's own canonical data model (entities + fields).
-- Source files a customer sends get profiled in the browser, their columns are
-- matched to target fields, and confirmed mappings feed the Data Specification.
-- All new tables, so nothing here needs the one-time data migration in section 9.

create table if not exists target_models (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  description text,
  is_starter boolean default false,
  created_at timestamptz default now()
);

create table if not exists target_entities (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references target_models(id) on delete cascade,
  name text not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists target_fields (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references target_entities(id) on delete cascade,
  name text not null,
  data_type text default 'string' check (data_type in ('string','integer','decimal','date','datetime','boolean')),
  required boolean default false,
  is_key boolean default false,
  description text,
  synonyms text[] default '{}',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Which target entities are in scope for a given project. Coverage is computed
-- over these, so an entity the customer never sends still shows up as a gap.
create table if not exists project_scope_entities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  entity_id uuid not null references target_entities(id) on delete cascade,
  created_at timestamptz default now(),
  unique (project_id, entity_id)
);

-- One row per uploaded source file. Only statistics are stored, never row data
-- and never sample values; the file itself is read in the browser.
create table if not exists source_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text,
  source_system text,
  direction text default 'Inbound',
  mode text default 'data' check (mode in ('data','field_list')),
  row_count int,
  truncated boolean default false,
  profiled_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists source_columns (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references source_profiles(id) on delete cascade,
  sheet_name text,
  name text not null,
  inferred_type text,
  null_pct numeric,
  distinct_count int,
  distinct_capped boolean default false,
  declared_required boolean,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- One row per source column at most. status 'rejected' with a null target means
-- "this column is deliberately not mapped"; a rejected row with a target keeps a
-- declined suggestion from coming back.
create table if not exists field_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_column_id uuid not null references source_columns(id) on delete cascade,
  target_field_id uuid references target_fields(id) on delete cascade,
  transformation text,
  status text default 'suggested' check (status in ('suggested','confirmed','rejected')),
  match_method text check (match_method in ('exact','synonym','fuzzy','ai','manual')),
  type_check text check (type_check in ('compatible','convertible','conflict','unknown')),
  notes text,
  created_at timestamptz default now(),
  unique (source_column_id),
  check (status = 'rejected' or target_field_id is not null)
);

alter table target_models enable row level security;
alter table target_entities enable row level security;
alter table target_fields enable row level security;
alter table project_scope_entities enable row level security;
alter table source_profiles enable row level security;
alter table source_columns enable row level security;
alter table field_mappings enable row level security;

create policy "owner full access" on target_models for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on source_profiles for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner full access" on field_mappings for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "owner via model" on target_entities for all
  using (exists (select 1 from target_models where target_models.id = target_entities.model_id and target_models.owner_id = auth.uid()))
  with check (exists (select 1 from target_models where target_models.id = target_entities.model_id and target_models.owner_id = auth.uid()));

create policy "owner via entity and model" on target_fields for all
  using (exists (select 1 from target_entities e join target_models m on m.id = e.model_id where e.id = target_fields.entity_id and m.owner_id = auth.uid()))
  with check (exists (select 1 from target_entities e join target_models m on m.id = e.model_id where e.id = target_fields.entity_id and m.owner_id = auth.uid()));

create policy "owner via project" on project_scope_entities for all
  using (exists (select 1 from projects where projects.id = project_scope_entities.project_id and projects.owner_id = auth.uid()))
  with check (exists (select 1 from projects where projects.id = project_scope_entities.project_id and projects.owner_id = auth.uid()));

create policy "owner via profile" on source_columns for all
  using (exists (select 1 from source_profiles where source_profiles.id = source_columns.profile_id and source_profiles.owner_id = auth.uid()))
  with check (exists (select 1 from source_profiles where source_profiles.id = source_columns.profile_id and source_profiles.owner_id = auth.uid()));

-- ========== 9. One-time data migration — DO THIS BEFORE INVITING ANYONE ==========
-- (Section 8's tables are brand new, so they need nothing here.)
-- Find your own user id first:
--   select id, email from auth.users;
-- Then, substituting that id below, assign all your existing rows to yourself
-- (replace 'YOUR-USER-ID-HERE' on every line):
--
-- update projects set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update roles set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update sows set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update change_orders set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update sdds set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update blueprints set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update data_spec_entities set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update discovery_findings set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update integrations set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
-- update app_settings set owner_id = 'YOUR-USER-ID-HERE' where owner_id is null;
--
-- Then make yourself admin so you can manage the invite allowlist from inside the app:
-- insert into app_admins (user_id) values ('YOUR-USER-ID-HERE');
