-- PMO Console schema v6 — additive to schema_v5.sql. Run this after v5.
-- Discovery Review: generic findings across 7 types, plus Integrations as the
-- one deeply-modeled object type with a real required-field schema.

create table if not exists discovery_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null,                    -- Requirement | Decision | Assumption | Dependency | TBD | Constraint | Open Question
  title text not null,
  description text,
  source_name text,
  source_excerpt text,
  status text default 'Pending',         -- Pending | Confirmed | Rejected
  created_at timestamptz default now()
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_system text,
  target_system text,
  direction text,                        -- Inbound | Outbound | Bidirectional
  mechanism text,                        -- REST API | SFTP | Batch file | Webhook
  owner text,
  trigger_type text,                     -- Real-time | Batch | Event-driven
  cadence text,
  mode text,                             -- Sync | Async
  critical_path boolean default false,
  blocks_workflow boolean default false,
  authentication text,
  data_contract text,
  error_handling text,
  source_name text,
  source_excerpt text,
  status text default 'Pending',         -- Pending | Confirmed | Rejected
  created_at timestamptz default now()
);

alter table discovery_findings enable row level security;
alter table integrations enable row level security;

create policy "authenticated full access" on discovery_findings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on integrations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
