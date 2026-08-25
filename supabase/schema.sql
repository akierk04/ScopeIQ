-- PMO Console schema. Run this in Supabase SQL editor.
-- RLS is restricted to authenticated users only — unlike BPL, this data
-- (customer/account names, internal risk logs) is not meant to be public.

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account text,
  vertical text,
  owner text,
  health text default 'Green',
  stage text default 'Discovery',
  start_date date,
  target_date date,
  notes text,
  milestones jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  source text default 'manual',
  created_at timestamptz default now()
);

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

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  name text,
  phases jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: only signed-in users (i.e. you) can touch any of this.
alter table projects enable row level security;
alter table risks enable row level security;
alter table sows enable row level security;
alter table workflows enable row level security;

create policy "authenticated full access" on projects for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on risks for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on sows for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated full access" on workflows for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Keep updated_at current on projects/workflows.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger workflows_set_updated_at before update on workflows
  for each row execute function set_updated_at();
