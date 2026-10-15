// Mapping coverage and quality flags. Pure arithmetic over confirmed mappings.
// No AI, no invented numbers: every figure below can be recomputed by hand.
//
//   coverage = required target fields with at least one CONFIRMED mapping
//              / required target fields, over the entities in scope.
//
// Suggested (unreviewed) mappings never count toward coverage.

export const DEFAULT_QUALITY = {
  // A required target field fed by a column with more nulls than this is flagged.
  // v0.1 hypothesis, not validated. Editable in the UI.
  highNullPct: 20,
};

// model: { entities:[{id,name}], fields:[{id,entityId,name,required}] }
// scopeEntityIds: Set/array of entity ids in scope for the project
// mappings: [{ id, sourceColumnId, targetFieldId, status, typeCheck }]
// columnsById: Map or object of source columns { id -> {name, sheetName, nullPct} }
export function computeCoverage({ model, scopeEntityIds, mappings, columnsById, quality = DEFAULT_QUALITY }) {
  const scope = new Set(scopeEntityIds || []);
  const col = (id) => (columnsById instanceof Map ? columnsById.get(id) : columnsById?.[id]);
  const confirmed = mappings.filter((m) => m.status === "confirmed" && m.targetFieldId);
  const confirmedByField = new Map();
  for (const m of confirmed) {
    if (!confirmedByField.has(m.targetFieldId)) confirmedByField.set(m.targetFieldId, []);
    confirmedByField.get(m.targetFieldId).push(m);
  }

  const entities = [];
  const gaps = [];
  let requiredTotal = 0;
  let requiredMapped = 0;

  for (const entity of model.entities) {
    if (!scope.has(entity.id)) continue;
    const required = model.fields.filter((f) => f.entityId === entity.id && f.required);
    const mapped = required.filter((f) => confirmedByField.has(f.id));
    const missing = required.filter((f) => !confirmedByField.has(f.id));
    requiredTotal += required.length;
    requiredMapped += mapped.length;
    for (const f of missing) gaps.push({ entityId: entity.id, entityName: entity.name, fieldId: f.id, fieldName: f.name });
    entities.push({
      entityId: entity.id,
      entityName: entity.name,
      requiredTotal: required.length,
      requiredMapped: mapped.length,
      pct: required.length ? Math.round((mapped.length / required.length) * 100) : null,
    });
  }

  // Quality flags on confirmed mappings into in-scope required fields.
  const fieldById = new Map(model.fields.map((f) => [f.id, f]));
  const entityName = new Map(model.entities.map((e) => [e.id, e.name]));
  const flags = [];
  for (const m of confirmed) {
    const f = fieldById.get(m.targetFieldId);
    if (!f || !scope.has(f.entityId)) continue;
    const c = col(m.sourceColumnId);
    const label = `${c?.sheetName ? c.sheetName + "." : ""}${c?.name || "?"} → ${entityName.get(f.entityId)}.${f.name}`;
    if (m.typeCheck === "conflict") flags.push({ kind: "type_conflict", severity: "high", text: `${label}: source type conflicts with target type` });
    if (f.required && c && c.nullPct !== null && c.nullPct !== undefined && c.nullPct > quality.highNullPct) {
      flags.push({ kind: "high_nulls", severity: "high", text: `${label}: required field, but ${c.nullPct}% of source values are empty` });
    }
  }

  const suggestedPending = mappings.filter((m) => m.status === "suggested").length;
  return {
    overall: {
      requiredTotal,
      requiredMapped,
      pct: requiredTotal ? Math.round((requiredMapped / requiredTotal) * 100) : null,
    },
    entities,
    gaps,
    flags,
    suggestedPending,
  };
}
