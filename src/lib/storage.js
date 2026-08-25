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
    async create(item) {
      const { data, error } = await db.from(table).insert(toDb(item)).select().single();
      if (error) throw error;
      return fromDb(data);
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
  notes: r.notes || "", blueprintId: r.blueprint_id || null,
});
const projectToDb = (p) => ({
  name: p.name, account: p.account, vertical: p.vertical, owner: p.owner, health: p.health,
  stage: p.stage, start_date: p.startDate || null, target_date: p.targetDate || null,
  notes: p.notes, blueprint_id: p.blueprintId || null,
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
});
const sowToDb = (s) => ({
  project_id: s.projectId || null, vertical: s.vertical, use_case_type: s.useCaseType, complexity: s.complexity,
  total_weeks: s.totalWeeks, total_hours: s.totalHours, phases: s.phases || [], assumptions: s.assumptions || [], narrative: s.narrative,
});
export const sowsTable = makeTable("sows", sowFromDb, sowToDb);
