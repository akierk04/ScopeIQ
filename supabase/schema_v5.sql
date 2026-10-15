-- PMO Console schema v5 — additive to schema_v4.sql. Run this after v4.
-- Adds: Data Specification (structured, per-project — an entity/field model
-- of inbound/outbound data flows), and sdds (generated Solution Design Docs).

create table if not exists data_spec_entities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  direction text default 'Input',        -- 'Input' | 'Output'
  frequency text,                        -- e.g. "Weekly", "Daily", "On-demand"
  api_type text,                         -- e.g. "REST API", "SFTP file", "Batch upload"
  refresh_type text,                     -- 'Replace' | 'Upsert' | 'Incremental' | 'Full Refresh'
  estimated_rows numeric,
  description text,
  created_at timestamptz default now()
);

create table if not exists data_spec_fields (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references data_spec_entities(id) on delete cascade,
  field_name text not null,
  source_field_name text,                -- the client/source system's own name for this field
  description text,
  data_type text,
  is_primary_key boolean default false,
  allow_null boolean default true,
  comments text,
  example_values text,
  order_index int default 0,
  created_at timestamptz default now()
);

-- Solution Design Documents — generated, saved, exportable, same pattern as sows.
create table if not exists sdds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  solution_overview text,
  benefits jsonb default '[]',
  objectives jsonb default '[]',
  in_scope jsonb default '[]',
  out_of_scope jsonb default '[]',
  assumptions jsonb default '[]',
  risks jsonb default '[]',
  architecture_overview text,
  modules jsonb default '[]',            -- [{name, requirements: [...], acceptanceCriteria: [...]}]
  narrative text,
  status text default 'Draft',
  created_at timestamptz default now()
);

alter table data_spec_entities enable row level security;
alter table data_spec_fields enable row level security;
alter table sdds enable row level security;

create policy "authenticated full access" on data_spec_entities for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on data_spec_fields for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on sdds for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
