import { db } from "./supabaseClient";

function makeTable(table, fromDb, toDb, idField = "id") {
  return {
    async list(filter) {
      let q = db.from(table).select("*").order("created_at", { ascending: true });
      if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      const { data, error } = await q;
      if (error) throw error;
      return data.map(fromDb);
    },
    async listIn(column, values) {
      if (!values.length) return [];
      const { data, error } = await db.from(table).select("*").in(column, values).order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(fromDb);
    },
    async create(item) {
      const { data, error } = await db.from(table).insert(toDb(item)).select().single();
      if (error) throw error;
      return fromDb(data);
    },
    async createMany(items) {
      if (!items.length) return [];
      const { data, error } = await db.from(table).insert(items.map(toDb)).select();
      if (error) throw error;
      return data.map(fromDb);
    },
    async update(id, patch) {
      const { data, error } = await db.from(table).update(toDb(patch)).eq(idField, id).select().single();
      if (error) throw error;
      return fromDb(data);
    },
    async remove(id) {
      const { error } = await db.from(table).delete().eq(idField, id);
      if (error) throw error;
    },
  };
}

/* ---------- Projects ---------- */
const projectFromDb = (r) => ({
  id: r.id, name: r.name, account: r.account, vertical: r.vertical, owner: r.owner,
  health: r.health, stage: r.stage, startDate: r.start_date || "", targetDate: r.target_date || "",
  notes: r.notes || "", blueprintId: r.blueprint_id || null, sowId: r.sow_id || null,
});
const projectToDb = (p) => ({
  name: p.name, account: p.account, vertical: p.vertical, owner: p.owner, health: p.health,
  stage: p.stage, start_date: p.startDate || null, target_date: p.targetDate || null,
  notes: p.notes, blueprint_id: p.blueprintId || null, sow_id: p.sowId || null,
});
export const projectsTable = makeTable("projects", projectFromDb, projectToDb);

/* ---------- Milestones ---------- */
const milestoneFromDb = (r) => ({ id: r.id, projectId: r.project_id, name: r.name, dueDate: r.due_date || "", status: r.status, isCritical: r.is_critical, owner: r.owner || "" });
const milestoneToDb = (m) => ({ project_id: m.projectId, name: m.name, due_date: m.dueDate || null, status: m.status, is_critical: !!m.isCritical, owner: m.owner });
export const milestonesTable = makeTable("milestones", milestoneFromDb, milestoneToDb);

/* ---------- Dependencies ---------- */
const depFromDb = (r) => ({ id: r.id, projectId: r.project_id, name: r.name, owner: r.owner || "", dueDate: r.due_date || "", status: r.status, isBlocking: r.is_blocking });
const depToDb = (d) => ({ project_id: d.projectId, name: d.name, owner: d.owner, due_date: d.dueDate || null, status: d.status, is_blocking: d.isBlocking !== false });
export const dependenciesTable = makeTable("dependencies", depFromDb, depToDb);

/* ---------- Risks ---------- */
const riskFromDb = (r) => ({
  id: r.id, projectId: r.project_id, description: r.description, likelihood: r.likelihood, impact: r.impact,
  mitigation: r.mitigation || "", escalationTrigger: r.escalation_trigger || "", status: r.status,
  materialized: r.materialized, source: r.source,
});
const riskToDb = (r) => ({
  project_id: r.projectId || null, description: r.description, likelihood: r.likelihood, impact: r.impact,
  mitigation: r.mitigation, escalation_trigger: r.escalationTrigger, status: r.status,
  materialized: !!r.materialized, source: r.source || "manual",
});
export const risksTable = makeTable("risks", riskFromDb, riskToDb);

/* ---------- Scope items ---------- */
const scopeFromDb = (r) => ({ id: r.id, projectId: r.project_id, name: r.name, description: r.description || "", status: r.status });
const scopeToDb = (s) => ({ project_id: s.projectId, name: s.name, description: s.description, status: s.status });
export const scopeItemsTable = makeTable("scope_items", scopeFromDb, scopeToDb);

/* ---------- Change requests ---------- */
const crFromDb = (r) => ({ id: r.id, projectId: r.project_id, description: r.description, impactHours: r.impact_hours, impactWeeks: r.impact_weeks, status: r.status, createdAt: r.created_at });
const crToDb = (c) => ({ project_id: c.projectId, description: c.description, impact_hours: c.impactHours || null, impact_weeks: c.impactWeeks || null, status: c.status });
export const changeRequestsTable = makeTable("change_requests", crFromDb, crToDb);

/* ---------- Blueprints ---------- */
const bpFromDb = (r) => ({ id: r.id, name: r.name, description: r.description || "", source: r.source });
const bpToDb = (b) => ({ name: b.name, description: b.description, source: b.source || "manual" });
export const blueprintsTable = makeTable("blueprints", bpFromDb, bpToDb);

const phaseFromDb = (r) => ({
  id: r.id, blueprintId: r.blueprint_id, orderIndex: r.order_index, name: r.name,
  defaultOwnerRole: r.default_owner_role || "", defaultDurationWeeks: r.default_duration_weeks,
  defaultRiskFlags: r.default_risk_flags || [], exitCriteria: r.exit_criteria || "",
  defaultMilestones: r.default_milestones || [],
});
const phaseToDb = (p) => ({
  blueprint_id: p.blueprintId, order_index: p.orderIndex || 0, name: p.name,
  default_owner_role: p.defaultOwnerRole, default_duration_weeks: p.defaultDurationWeeks || null,
  default_risk_flags: p.defaultRiskFlags || [], exit_criteria: p.exitCriteria,
  default_milestones: p.defaultMilestones || [],
});
export const blueprintPhasesTable = makeTable("blueprint_phases", phaseFromDb, phaseToDb);

/* ---------- Closeouts (one per project, keyed by project_id) ---------- */
const closeoutFromDb = (r) => ({
  projectId: r.project_id, actualDurationWeeks: r.actual_duration_weeks, actualHours: r.actual_hours,
  scheduleVarianceDays: r.schedule_variance_days, varianceDrivers: r.variance_drivers || "",
  scopeChangesSummary: r.scope_changes_summary || "", risksMaterializedSummary: r.risks_materialized_summary || "",
  lessonsLearned: r.lessons_learned || "", closedAt: r.closed_at,
});
const closeoutToDb = (c) => ({
  project_id: c.projectId, actual_duration_weeks: c.actualDurationWeeks || null, actual_hours: c.actualHours || null,
  schedule_variance_days: c.scheduleVarianceDays ?? null, variance_drivers: c.varianceDrivers,
  scope_changes_summary: c.scopeChangesSummary, risks_materialized_summary: c.risksMaterializedSummary,
  lessons_learned: c.lessonsLearned,
});
export const closeoutsTable = {
  async get(projectId) {
    const { data, error } = await db.from("closeouts").select("*").eq("project_id", projectId).maybeSingle();
    if (error) throw error;
    return data ? closeoutFromDb(data) : null;
  },
  async upsert(closeout) {
    const { data, error } = await db.from("closeouts").upsert(closeoutToDb(closeout), { onConflict: "project_id" }).select().single();
    if (error) throw error;
    return closeoutFromDb(data);
  },
  async list() {
    const { data, error } = await db.from("closeouts").select("*");
    if (error) throw error;
    return data.map(closeoutFromDb);
  },
};

/* ---------- SOWs (unchanged from v1) ---------- */
const sowFromDb = (r) => ({
  id: r.id, projectId: r.project_id, vertical: r.vertical, useCaseType: r.use_case_type, complexity: r.complexity,
  totalWeeks: r.total_weeks, totalHours: r.total_hours, phases: r.phases || [], assumptions: r.assumptions || [],
  narrative: r.narrative || "", createdAt: r.created_at,
  objectives: r.objectives || [], inScope: r.in_scope || [], outOfScope: r.out_of_scope || [],
  customerResponsibilities: r.customer_responsibilities || [], mode: r.mode || "T&M", status: r.status || "Draft",
});
const sowToDb = (s) => ({
  project_id: s.projectId || null, vertical: s.vertical, use_case_type: s.useCaseType, complexity: s.complexity,
  total_weeks: s.totalWeeks, total_hours: s.totalHours, phases: s.phases || [], assumptions: s.assumptions || [], narrative: s.narrative,
  objectives: s.objectives || [], in_scope: s.inScope || [], out_of_scope: s.outOfScope || [],
  customer_responsibilities: s.customerResponsibilities || [], mode: s.mode || "T&M", status: s.status || "Draft",
});
export const sowsTable = makeTable("sows", sowFromDb, sowToDb);

/* ---------- Data Specification (structured, per-project) ---------- */
const dseFromDb = (r) => ({
  id: r.id, projectId: r.project_id, name: r.name, direction: r.direction || "Input",
  frequency: r.frequency || "", apiType: r.api_type || "", refreshType: r.refresh_type || "",
  estimatedRows: r.estimated_rows, description: r.description || "",
});
const dseToDb = (e) => ({
  project_id: e.projectId, name: e.name, direction: e.direction, frequency: e.frequency,
  api_type: e.apiType, refresh_type: e.refreshType, estimated_rows: e.estimatedRows || null, description: e.description,
});
export const dataSpecEntitiesTable = makeTable("data_spec_entities", dseFromDb, dseToDb);

const dsfFromDb = (r) => ({
  id: r.id, entityId: r.entity_id, fieldName: r.field_name, sourceFieldName: r.source_field_name || "",
  description: r.description || "", dataType: r.data_type || "", isPrimaryKey: r.is_primary_key,
  allowNull: r.allow_null, comments: r.comments || "", exampleValues: r.example_values || "", orderIndex: r.order_index || 0,
});
const dsfToDb = (f) => ({
  entity_id: f.entityId, field_name: f.fieldName, source_field_name: f.sourceFieldName, description: f.description,
  data_type: f.dataType, is_primary_key: !!f.isPrimaryKey, allow_null: f.allowNull !== false,
  comments: f.comments, example_values: f.exampleValues, order_index: f.orderIndex || 0,
});
export const dataSpecFieldsTable = makeTable("data_spec_fields", dsfFromDb, dsfToDb);

/* ---------- Solution Design Documents ---------- */
const sddFromDb = (r) => ({
  id: r.id, projectId: r.project_id, solutionOverview: r.solution_overview || "", benefits: r.benefits || [],
  objectives: r.objectives || [], inScope: r.in_scope || [], outOfScope: r.out_of_scope || [],
  assumptions: r.assumptions || [], risks: r.risks || [], architectureOverview: r.architecture_overview || "",
  modules: r.modules || [], narrative: r.narrative || "", status: r.status || "Draft", createdAt: r.created_at,
});
const sddToDb = (s) => ({
  project_id: s.projectId || null, solution_overview: s.solutionOverview, benefits: s.benefits || [],
  objectives: s.objectives || [], in_scope: s.inScope || [], out_of_scope: s.outOfScope || [],
  assumptions: s.assumptions || [], risks: s.risks || [], architecture_overview: s.architectureOverview,
  modules: s.modules || [], narrative: s.narrative, status: s.status || "Draft",
});
export const sddsTable = makeTable("sdds", sddFromDb, sddToDb);

/* ---------- Discovery findings (7 generic types) ---------- */
const dfFromDb = (r) => ({
  id: r.id, projectId: r.project_id, type: r.type, title: r.title, description: r.description || "",
  sourceName: r.source_name || "", sourceExcerpt: r.source_excerpt || "", status: r.status || "Pending",
});
const dfToDb = (f) => ({
  project_id: f.projectId, type: f.type, title: f.title, description: f.description,
  source_name: f.sourceName, source_excerpt: f.sourceExcerpt, status: f.status || "Pending",
});
export const discoveryFindingsTable = makeTable("discovery_findings", dfFromDb, dfToDb);

/* ---------- Integrations (deep-modeled, for Definition Score) ---------- */
const intFromDb = (r) => ({
  id: r.id, projectId: r.project_id, sourceSystem: r.source_system || "", targetSystem: r.target_system || "",
  direction: r.direction || "", mechanism: r.mechanism || "", owner: r.owner || "", trigger: r.trigger_type || "",
  cadence: r.cadence || "", mode: r.mode || "", criticalPath: r.critical_path, blocksWorkflow: r.blocks_workflow,
  authentication: r.authentication || "", dataContract: r.data_contract || "", errorHandling: r.error_handling || "",
  sourceName: r.source_name || "", sourceExcerpt: r.source_excerpt || "", status: r.status || "Pending",
});
const intToDb = (i) => ({
  project_id: i.projectId, source_system: i.sourceSystem, target_system: i.targetSystem, direction: i.direction,
  mechanism: i.mechanism, owner: i.owner, trigger_type: i.trigger, cadence: i.cadence, mode: i.mode,
  critical_path: !!i.criticalPath, blocks_workflow: !!i.blocksWorkflow, authentication: i.authentication,
  data_contract: i.dataContract, error_handling: i.errorHandling, source_name: i.sourceName,
  source_excerpt: i.sourceExcerpt, status: i.status || "Pending",
});
export const integrationsTable = makeTable("integrations", intFromDb, intToDb);

/* ---------- Data Model (target model) ---------- */
const tmFromDb = (r) => ({ id: r.id, name: r.name, description: r.description || "", isStarter: !!r.is_starter });
const tmToDb = (m) => ({ name: m.name, description: m.description || null, is_starter: !!m.isStarter });
export const targetModelsTable = makeTable("target_models", tmFromDb, tmToDb);

const teFromDb = (r) => ({ id: r.id, modelId: r.model_id, name: r.name, description: r.description || "", sortOrder: r.sort_order || 0 });
const teToDb = (e) => ({ model_id: e.modelId, name: e.name, description: e.description || null, sort_order: e.sortOrder || 0 });
export const targetEntitiesTable = makeTable("target_entities", teFromDb, teToDb);

const tfFromDb = (r) => ({
  id: r.id, entityId: r.entity_id, name: r.name, dataType: r.data_type || "string", required: !!r.required,
  isKey: !!r.is_key, description: r.description || "", synonyms: r.synonyms || [], sortOrder: r.sort_order || 0,
});
const tfToDb = (f) => ({
  entity_id: f.entityId, name: f.name, data_type: f.dataType || "string", required: !!f.required, is_key: !!f.isKey,
  description: f.description || null, synonyms: f.synonyms || [], sort_order: f.sortOrder || 0,
});
export const targetFieldsTable = makeTable("target_fields", tfFromDb, tfToDb);

const pseFromDb = (r) => ({ id: r.id, projectId: r.project_id, entityId: r.entity_id });
const pseToDb = (x) => ({ project_id: x.projectId, entity_id: x.entityId });
export const projectScopeEntitiesTable = makeTable("project_scope_entities", pseFromDb, pseToDb);

/* ---------- Source profiles, columns and mappings ---------- */
const spFromDb = (r) => ({
  id: r.id, projectId: r.project_id, fileName: r.file_name || "", sourceSystem: r.source_system || "",
  direction: r.direction || "Inbound", mode: r.mode || "data", rowCount: r.row_count, truncated: !!r.truncated, profiledAt: r.profiled_at,
});
const spToDb = (p) => ({
  project_id: p.projectId, file_name: p.fileName, source_system: p.sourceSystem, direction: p.direction || "Inbound",
  mode: p.mode || "data", row_count: p.rowCount ?? null, truncated: !!p.truncated,
});
export const sourceProfilesTable = makeTable("source_profiles", spFromDb, spToDb);

const scFromDb = (r) => ({
  id: r.id, profileId: r.profile_id, sheetName: r.sheet_name || "", name: r.name, inferredType: r.inferred_type || "string",
  nullPct: r.null_pct === null || r.null_pct === undefined ? null : Number(r.null_pct),
  distinctCount: r.distinct_count, distinctCapped: !!r.distinct_capped, declaredRequired: r.declared_required, sortOrder: r.sort_order || 0,
});
const scToDb = (c) => ({
  profile_id: c.profileId, sheet_name: c.sheetName, name: c.name, inferred_type: c.inferredType, null_pct: c.nullPct ?? null,
  distinct_count: c.distinctCount ?? null, distinct_capped: !!c.distinctCapped, declared_required: c.declaredRequired ?? null,
  sort_order: c.sortOrder || 0,
});
export const sourceColumnsTable = makeTable("source_columns", scFromDb, scToDb);

const fmFromDb = (r) => ({
  id: r.id, projectId: r.project_id, sourceColumnId: r.source_column_id, targetFieldId: r.target_field_id || null,
  transformation: r.transformation || "", status: r.status || "suggested", matchMethod: r.match_method || null,
  typeCheck: r.type_check || "unknown", notes: r.notes || "",
});
const fmToDb = (m) => ({
  project_id: m.projectId, source_column_id: m.sourceColumnId, target_field_id: m.targetFieldId || null,
  transformation: m.transformation || null, status: m.status || "suggested", match_method: m.matchMethod || null,
  type_check: m.typeCheck || "unknown", notes: m.notes || null,
});
const fieldMappingsBase = makeTable("field_mappings", fmFromDb, fmToDb);
export const fieldMappingsTable = {
  ...fieldMappingsBase,
  // Bulk "confirm all" without one round trip per row.
  async confirmMany(ids) {
    if (!ids.length) return;
    const { error } = await db.from("field_mappings").update({ status: "confirmed" }).in("id", ids);
    if (error) throw error;
  },
};

/* ---------- Roles / rate card ---------- */
const roleFromDb = (r) => ({ id: r.id, name: r.name, hourlyRate: r.hourly_rate });
const roleToDb = (r) => ({ name: r.name, hourly_rate: r.hourlyRate || null });
export const rolesTable = makeTable("roles", roleFromDb, roleToDb);

/* ---------- Change orders ---------- */
const coFromDb = (r) => ({
  id: r.id, sowId: r.sow_id, projectId: r.project_id, changeOrderNumber: r.change_order_number,
  objective: r.objective, originalSowTerms: r.original_sow_terms, changes: r.changes || [],
  assumptions: r.assumptions || [], resourceLines: r.resource_lines || [], totalFee: r.total_fee,
  narrative: r.narrative || "", createdAt: r.created_at,
});
const coToDb = (c) => ({
  sow_id: c.sowId || null, project_id: c.projectId || null, change_order_number: c.changeOrderNumber || null,
  objective: c.objective, original_sow_terms: c.originalSowTerms, changes: c.changes || [],
  assumptions: c.assumptions || [], resource_lines: c.resourceLines || [], total_fee: c.totalFee, narrative: c.narrative,
});
export const changeOrdersTable = makeTable("change_orders", coFromDb, coToDb);

/* ---------- App settings (key-value) ---------- */
export const settingsTable = {
  async getAll() {
    const { data, error } = await db.from("app_settings").select("*");
    if (error) throw error;
    const map = {};
    data.forEach((r) => (map[r.key] = r.value));
    return map;
  },
  async set(key, value) {
    // Composite key is (owner_id, key) since Settings is per-user now. owner_id
    // isn't passed explicitly — the column default (auth.uid()) fills it in,
    // and that's enough for the conflict target to match correctly.
    const { error } = await db.from("app_settings").upsert({ key, value }, { onConflict: "owner_id,key" });
    if (error) throw error;
  },
};

/* ---------- Admin / invite allowlist ---------- */
export const adminTable = {
  async amIAdmin() {
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) return false;
    const { data, error } = await db.from("app_admins").select("user_id").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return !!data;
  },
};

export const allowedEmailsTable = {
  async isAllowed(email) {
    // Deliberately unauthenticated-readable (see schema_v7.sql) so this check
    // can run before the person has an account at all.
    const { data, error } = await db.from("allowed_emails").select("email").ilike("email", email.trim()).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  async list() {
    const { data, error } = await db.from("allowed_emails").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async add(email) {
    const { error } = await db.from("allowed_emails").insert({ email: email.trim().toLowerCase() });
    if (error) throw error;
  },
  async remove(email) {
    const { error } = await db.from("allowed_emails").delete().eq("email", email);
    if (error) throw error;
  },
};
