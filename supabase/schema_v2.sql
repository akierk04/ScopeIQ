-- PMO Console schema v2 — normalized entities, Projects as the hub.
-- Replaces the v1 schema (JSON-blob milestones/phases, workflows table).
-- If migrating from v1: back up first, this drops the old `workflows` table
-- and the `milestones` jsonb column on `projects`.

create extension if not exists "pgcrypto";

-- ---------- Core ----------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account text,
  vertical text,
  owner text,
  health text default 'Green',          -- manual, PM-reported
  stage text default 'Discovery',
  start_date date,
  target_date date,
  notes text,
  blueprint_id uuid,                    -- set if this project was started from a blueprint
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  due_date date,
  status text default 'Pending',        -- Pending | In progress | Done | Blocked
  is_critical boolean default false,
  owner text,
  created_at timestamptz default now()
);

create table if not exists dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  owner text,                            -- who/which party owes this
  due_date date,
  status text default 'Pending',         -- Pending | Received | Blocked
  is_blocking boolean default true,      -- blocks project progress if late
  created_at timestamptz default now()
);

create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  description text not null,
  likelihood text,
  impact text,
  mitigation text,
  escalation_trigger text,
  status text default 'Open',
  materialized boolean default false,    -- did this actually happen? (set at closeout)
  source text default 'manual',          -- manual | ai
  created_at timestamptz default now()
);

create table if not exists scope_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  status text default 'In scope',        -- Proposed | In scope | Descoped
  created_at timestamptz default now()
);

create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  description text not null,
  impact_hours numeric,
  impact_weeks numeric,
  status text default 'Proposed',        -- Proposed | Approved | Rejected
  created_at timestamptz default now()
);

-- ---------- Blueprints (reusable implementation templates) ----------

create table if not exists blueprints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source text default 'manual',          -- manual | ai
  created_at timestamptz default now()
);

create table if not exists blueprint_phases (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references blueprints(id) on delete cascade,
  order_index int default 0,
  name text not null,
  default_owner_role text,
  default_duration_weeks numeric,
  default_risk_flags jsonb default '[]',
  exit_criteria text,
  -- default milestones for this phase, cloned relative to project start_date:
  -- [{"name": "...", "weekOffset": 2}]
  default_milestones jsonb default '[]',
  created_at timestamptz default now()
);

-- ---------- SOWs (scope/effort estimates, optionally linked to a project) ----------

create table if not exists sows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  vertical text,
  use_case_type text,
  complexity text,
  total_weeks numeric,
  total_hours numeric,
  phases jsonb default '[]',
  assumptions jsonb default '[]',
  narrative text,
  created_at timestamptz default now()
);

-- ---------- Closeout (estimate-vs-actual capture, one per project) ----------

create table if not exists closeouts (
  project_id uuid primary key references projects(id) on delete cascade,
  actual_duration_weeks numeric,
  actual_hours numeric,
  schedule_variance_days int,            -- derived from milestones at closeout time, stored for history
  variance_drivers text,                 -- human-entered, cannot be derived
  scope_changes_summary text,            -- pre-filled from change_requests, human-editable
  risks_materialized_summary text,       -- pre-filled from risks.materialized, human-editable
  lessons_learned text,                  -- human-entered, cannot be derived
  closed_at timestamptz default now()
);

alter table projects add constraint projects_blueprint_fk
  foreign key (blueprint_id) references blueprints(id) on delete set null;

-- ---------- RLS: authenticated users only ----------

alter table projects enable row level security;
alter table milestones enable row level security;
alter table dependencies enable row level security;
alter table risks enable row level security;
alter table scope_items enable row level security;
alter table change_requests enable row level security;
alter table blueprints enable row level security;
alter table blueprint_phases enable row level security;
alter table closeouts enable row level security;
alter table sows enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects','milestones','dependencies','risks','scope_items','change_requests','blueprints','blueprint_phases','closeouts','sows']
  loop
    execute format(
      'create policy "authenticated full access" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- ---------- updated_at trigger ----------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
