-- PMO Console schema v3 — additive to schema_v2.sql. Run this after v2.
-- Adds: roles (rate card), change_orders (linked to a SOW), app_settings (vendor/product identity).

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hourly_rate numeric,
  created_at timestamptz default now()
);

-- Extend sows with the fields the rebuilt SOW generator produces.
alter table sows add column if not exists objectives jsonb default '[]';
alter table sows add column if not exists in_scope jsonb default '[]';
alter table sows add column if not exists out_of_scope jsonb default '[]';
alter table sows add column if not exists customer_responsibilities jsonb default '[]';
alter table sows add column if not exists mode text default 'T&M';

create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  sow_id uuid references sows(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  change_order_number int,
  objective text,
  original_sow_terms text,
  changes jsonb default '[]',           -- array of strings, "Change(s) Pursuant to this Change Order"
  assumptions jsonb default '[]',
  resource_lines jsonb default '[]',    -- [{role, hours}] — rate applied client-side from roles table
  total_fee numeric,
  narrative text,
  created_at timestamptz default now()
);

-- Single-tenant identity settings (vendor/product name). Key-value, so the app
-- can create rows on first use rather than requiring a seed script.
create table if not exists app_settings (
  key text primary key,
  value text
);

alter table roles enable row level security;
alter table change_orders enable row level security;
alter table app_settings enable row level security;

create policy "authenticated full access" on roles for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on change_orders for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on app_settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
