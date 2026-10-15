-- PMO Console schema v4 — additive to schema_v3.sql. Run this after v3.
-- Makes "contract before project" a real, enforceable flow instead of two
-- disconnected tools: a SOW gets a status, and a project can record which
-- approved SOW it was created from.

alter table sows add column if not exists status text default 'Draft';
-- status: 'Draft' | 'Approved' | 'Rejected'

alter table projects add column if not exists sow_id uuid references sows(id) on delete set null;
