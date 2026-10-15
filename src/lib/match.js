// Deterministic source-column to target-field matching. No AI in this file.
//
// Order of attempts, strongest first:
//   exact   normalized names are identical
//   synonym normalized name equals one of the target field's synonyms
//   fuzzy   share of whole-word tokens in common is above a threshold
//
// Character-level edit distance is deliberately NOT used: testing showed it
// matches different words that are one letter apart (contract_id vs contact_id).
// Typos and anything else the rules miss are left for the optional, user-triggered
// AI suggestion step.
//
// The threshold is a v0.1 hypothesis, not validated against real projects. It is
// exported so the UI can show and adjust it.

export const DEFAULT_THRESHOLDS = {
  fuzzyJaccard: 0.5, // share of tokens in common (0 to 1)
};

// Built-in abbreviation table, applied to both sides before comparing.
// Deliberately small and boring. Per-field synonyms (editable in the Data
// Model page) handle anything domain-specific.
const ABBREVIATIONS = {
  qty: "quantity", quan: "quantity", cust: "customer", custno: "customer number",
  num: "number", nbr: "number", no: "number", nr: "number", amt: "amount", desc: "description",
  descr: "description", dt: "date", addr: "address", ph: "phone", tel: "phone", telephone: "phone",
  prod: "product", ord: "order", inv: "invoice", loc: "location", acct: "account", cat: "category",
  curr: "currency", ccy: "currency", pct: "percent", zip: "postal", zipcode: "postal", postcode: "postal",
  mfr: "manufacturer", uom: "unit measure", unit: "unit", seq: "sequence", ref: "reference",
  st: "state", cd: "code", nm: "name", typ: "type", stat: "status", wh: "warehouse",
};

function singular(t) {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

export function tokenize(raw) {
  if (raw === null || raw === undefined) return [];
  const spaced = String(raw)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .trim();
  if (!spaced) return [];
  const out = [];
  for (const t of spaced.split(/\s+/)) {
    const exp = ABBREVIATIONS[t];
    if (exp) out.push(...exp.split(" ").map(singular));
    else out.push(singular(t));
  }
  return out;
}

export const normalizeName = (raw) => tokenize(raw).join(" ");

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------- Type compatibility ----------
// source type -> target type. This flags a problem for a human; it never blocks a mapping.
const NUMERIC = new Set(["integer", "decimal"]);
const TEMPORAL = new Set(["date", "datetime"]);

export function typeCheck(sourceType, targetType) {
  if (!sourceType || !targetType) return "unknown";
  if (sourceType === targetType) return "compatible";
  if (sourceType === "integer" && targetType === "decimal") return "compatible";
  if (sourceType === "date" && targetType === "datetime") return "compatible";
  if (sourceType === "decimal" && targetType === "integer") return "convertible"; // may lose precision
  if (sourceType === "datetime" && targetType === "date") return "convertible";   // drops time
  if (targetType === "string") return "convertible";                               // anything can be text
  if (sourceType === "string") return "convertible";                               // text needs parsing, can fail
  if (sourceType === "boolean" && targetType === "integer") return "convertible";
  if (sourceType === "integer" && targetType === "boolean") return "convertible";
  if ((NUMERIC.has(sourceType) && TEMPORAL.has(targetType)) || (TEMPORAL.has(sourceType) && NUMERIC.has(targetType))) return "conflict";
  return "conflict";
}

// ---------- Matching ----------

const METHOD_RANK = { exact: 3, synonym: 2, fuzzy: 1 };

// model: { entities: [{id, name}], fields: [{id, entityId, name, dataType, synonyms}] }
// columns: [{ key, name, sheetName, inferredType }]
// returns one result per column:
// { key, targetFieldId|null, method|null, typeCheck, ambiguous, alternatives: [{fieldId, method}] }
export function autoMatch(columns, model, thresholds = DEFAULT_THRESHOLDS) {
  const entityById = new Map(model.entities.map((e) => [e.id, e]));
  const prepared = model.fields.map((f) => ({
    field: f,
    tokens: tokenize(f.name),
    norm: normalizeName(f.name),
    syn: (f.synonyms || []).map(normalizeName).filter(Boolean),
    entityNorm: normalizeName(entityById.get(f.entityId)?.name || ""),
    entityTokens: tokenize(entityById.get(f.entityId)?.name || ""),
  }));

  return columns.map((col) => {
    const tokens = tokenize(col.name);
    const norm = tokens.join(" ");
    const sheetTokens = tokenize(col.sheetName || "");
    const sheetNorm = sheetTokens.join(" ");

    const cands = [];
    for (const p of prepared) {
      let method = null;
      let sim = 0;
      if (norm && norm === p.norm) { method = "exact"; sim = 1; }
      else if (norm && p.syn.includes(norm)) { method = "synonym"; sim = 1; }
      else if (norm) {
        const j = jaccard(tokens, p.tokens);
        if (j >= thresholds.fuzzyJaccard) { method = "fuzzy"; sim = j; }
      }
      if (!method) continue;
      // Entity affinity: does the source sheet look like this target entity?
      // 2 = same name, 1 = overlapping name, 0 = unrelated. Used only to break ties.
      let affinity = 0;
      if (sheetNorm && p.entityNorm) {
        if (sheetNorm === p.entityNorm) affinity = 2;
        else if (jaccard(sheetTokens, p.entityTokens) >= 0.5) affinity = 1;
      }
      cands.push({ fieldId: p.field.id, method, sim, affinity, dataType: p.field.dataType });
    }

    // Rank: method first, then sheet-to-entity affinity, then similarity.
    cands.sort((a, b) => METHOD_RANK[b.method] - METHOD_RANK[a.method] || b.affinity - a.affinity || b.sim - a.sim);
    const best = cands[0];
    if (!best) return { key: col.key, targetFieldId: null, method: null, typeCheck: "unknown", ambiguous: false, alternatives: [] };
    const tied = cands.filter((c) => c.method === best.method && c.affinity === best.affinity && Math.abs(c.sim - best.sim) < 1e-9);
    return {
      key: col.key,
      targetFieldId: best.fieldId,
      method: best.method,
      typeCheck: typeCheck(col.inferredType, best.dataType),
      ambiguous: tied.length > 1,
      alternatives: cands.slice(1, 5).map((c) => ({ fieldId: c.fieldId, method: c.method })),
    };
  });
}
