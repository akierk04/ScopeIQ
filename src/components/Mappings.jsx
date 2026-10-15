import React, { useState, useEffect, useMemo, useRef } from "react";
import { Upload, Trash2, Check, X } from "lucide-react";
import { AIButton, EmptyState, inputCls } from "./ui";
import { BlurInput } from "./DataModel";
import {
  targetModelsTable, targetEntitiesTable, targetFieldsTable, projectScopeEntitiesTable,
  sourceProfilesTable, sourceColumnsTable, fieldMappingsTable,
  dataSpecEntitiesTable, dataSpecFieldsTable,
} from "../lib/storage";
import { profileFile } from "../lib/profile";
import { autoMatch, typeCheck, DEFAULT_THRESHOLDS } from "../lib/match";
import { computeCoverage, DEFAULT_QUALITY } from "../lib/coverage";
import { callClaude } from "../lib/ai";

const METHOD_STYLE = {
  exact: "text-emerald-300 border-emerald-500/40",
  synonym: "text-teal-300 border-teal-500/40",
  fuzzy: "text-amber-300 border-amber-500/40",
  ai: "text-violet-300 border-violet-500/40",
  manual: "text-slate-300 border-slate-600",
};
const CHECK_STYLE = {
  compatible: "text-emerald-400",
  convertible: "text-amber-400",
  conflict: "text-rose-400",
  unknown: "text-slate-500",
};
const STATUS_STYLE = {
  suggested: "text-amber-300 border-amber-500/40",
  confirmed: "text-emerald-300 border-emerald-500/40",
  rejected: "text-slate-500 border-slate-700",
};

const Pill = ({ cls, children, title }) => (
  <span title={title} className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${cls}`}>{children}</span>
);

export default function Mappings({ project, onSpecChanged }) {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState([]);
  const [allEntities, setAllEntities] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [modelId, setModelId] = useState(null);
  const [scope, setScope] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [pending, setPending] = useState(null); // a profiled file not yet saved
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);
  const [filter, setFilter] = useState("all");
  const [aiBusy, setAiBusy] = useState(null);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [message, setMessage] = useState("");
  // Sample values live in memory only, for files profiled this session. Never saved.
  const samplesRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [ms, ents, flds, sc, pr, mp] = await Promise.all([
          targetModelsTable.list(), targetEntitiesTable.list(), targetFieldsTable.list(),
          projectScopeEntitiesTable.list({ project_id: project.id }),
          sourceProfilesTable.list({ project_id: project.id }),
          fieldMappingsTable.list({ project_id: project.id }),
        ]);
        const cols = await sourceColumnsTable.listIn("profile_id", pr.map((p) => p.id));
        if (cancelled) return;
        setModels(ms); setAllEntities(ents); setAllFields(flds); setScope(sc); setProfiles(pr); setColumns(cols); setMappings(mp);
        // Prefer the model that existing mappings already point into.
        const firstMapped = mp.find((m) => m.targetFieldId);
        const fieldRow = firstMapped && flds.find((f) => f.id === firstMapped.targetFieldId);
        const entRow = fieldRow && ents.find((e) => e.id === fieldRow.entityId);
        setModelId(entRow?.modelId || ms[0]?.id || null);
      } catch (e) {
        if (!cancelled) alert("Failed to load mappings: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  const model = useMemo(() => {
    const entities = allEntities.filter((e) => e.modelId === modelId).sort((a, b) => a.sortOrder - b.sortOrder);
    const ids = new Set(entities.map((e) => e.id));
    const fields = allFields.filter((f) => ids.has(f.entityId)).sort((a, b) => a.sortOrder - b.sortOrder);
    return { entities, fields };
  }, [allEntities, allFields, modelId]);

  const fieldById = useMemo(() => new Map(allFields.map((f) => [f.id, f])), [allFields]);
  const entityById = useMemo(() => new Map(allEntities.map((e) => [e.id, e])), [allEntities]);
  const columnsById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const mappingByColumn = useMemo(() => new Map(mappings.map((m) => [m.sourceColumnId, m])), [mappings]);
  const fieldLabel = (fid) => {
    const f = fieldById.get(fid);
    return f ? `${entityById.get(f.entityId)?.name || "?"}.${f.name}` : "?";
  };

  const scopeIds = useMemo(() => scope.map((s) => s.entityId), [scope]);
  const coverage = useMemo(
    () => computeCoverage({ model, scopeEntityIds: scopeIds, mappings, columnsById, quality }),
    [model, scopeIds, mappings, columnsById, quality]
  );

  // Ambiguity is recomputed from the rules rather than stored, so it survives reloads.
  const matchInfo = useMemo(() => {
    const res = autoMatch(columns.map((c) => ({ key: c.id, name: c.name, sheetName: c.sheetName, inferredType: c.inferredType })), model, thresholds);
    return new Map(res.map((r) => [r.key, r]));
  }, [columns, model, thresholds]);

  /* ---------- scope ---------- */
  const ensureScope = async (entityIds) => {
    const have = new Set(scope.map((s) => s.entityId));
    const missing = [...new Set(entityIds)].filter((id) => id && !have.has(id));
    if (!missing.length) return;
    const created = await projectScopeEntitiesTable.createMany(missing.map((entityId) => ({ projectId: project.id, entityId })));
    setScope((prev) => [...prev, ...created]);
  };
  const toggleScope = async (entityId) => {
    try {
      const row = scope.find((s) => s.entityId === entityId);
      if (row) { await projectScopeEntitiesTable.remove(row.id); setScope(scope.filter((s) => s.id !== row.id)); }
      else await ensureScope([entityId]);
    } catch (e) { alert("Update failed: " + e.message); }
  };

  /* ---------- upload and profile ---------- */
  const handleFile = async (e, mode = "auto", existingFile = null) => {
    const file = existingFile || e.target.files?.[0];
    if (e?.target) e.target.value = "";
    if (!file) return;
    setReading(true);
    setMessage("");
    try {
      const result = await profileFile(file, { mode });
      setPending({ file, mode, result, sourceSystem: pending?.sourceSystem || "" });
    } catch (err) { alert("Couldn't profile that file: " + err.message); }
    finally { setReading(false); }
  };

  const saveProfile = async () => {
    if (!model.fields.length) { alert("This project needs a Data Model with fields before columns can be matched. Create one under Data Model first."); return; }
    setSaving(true);
    try {
      const { result, file, sourceSystem } = pending;
      const profile = await sourceProfilesTable.create({
        projectId: project.id, fileName: file.name, sourceSystem: sourceSystem.trim(), direction: "Inbound",
        mode: result.mode, rowCount: result.rowCount, truncated: result.truncated,
      });
      const flat = [];
      result.sheets.forEach((s) => s.columns.forEach((c) => flat.push({ sheetName: s.sheetName, c })));
      const created = await sourceColumnsTable.createMany(flat.map(({ sheetName, c }, i) => ({
        profileId: profile.id, sheetName, name: c.name, inferredType: c.inferredType, nullPct: c.nullPct,
        distinctCount: c.distinctCount, distinctCapped: c.distinctCapped, declaredRequired: c.declaredRequired, sortOrder: i,
      })));
      // Match returned rows back to the in-memory samples by sheet+name (+ order for duplicates).
      const queues = new Map();
      flat.forEach(({ sheetName, c }) => {
        const k = sheetName + "\u0000" + c.name;
        if (!queues.has(k)) queues.set(k, []);
        queues.get(k).push(c.samples || []);
      });
      created.forEach((row) => {
        const q = queues.get(row.sheetName + "\u0000" + row.name);
        if (q && q.length) samplesRef.current.set(row.id, q.shift());
      });
      const newMappings = await runMatching(created);
      setProfiles((prev) => [...prev, profile]);
      setColumns((prev) => [...prev, ...created]);
      setMappings((prev) => [...prev, ...newMappings]);
      setPending(null);
      setMessage(`Profiled ${created.length} columns. ${newMappings.length} matched automatically; review them below. Nothing counts toward coverage until you confirm it.`);
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  // Deterministic matching for the given saved column rows. Returns created mapping rows.
  const runMatching = async (cols) => {
    const results = autoMatch(cols.map((c) => ({ key: c.id, name: c.name, sheetName: c.sheetName, inferredType: c.inferredType })), model, thresholds);
    const rows = results.filter((r) => r.targetFieldId).map((r) => ({
      projectId: project.id, sourceColumnId: r.key, targetFieldId: r.targetFieldId, status: "suggested",
      matchMethod: r.method, typeCheck: r.typeCheck,
    }));
    return fieldMappingsTable.createMany(rows);
  };

  const rematch = async (profileId) => {
    try {
      const cols = columns.filter((c) => c.profileId === profileId && !mappingByColumn.has(c.id));
      if (!cols.length) { setMessage("Every column in this file already has a decision."); return; }
      const created = await runMatching(cols);
      setMappings((prev) => [...prev, ...created]);
      setMessage(`Re-ran matching on ${cols.length} unmapped columns: ${created.length} new suggestions.`);
    } catch (e) { alert("Matching failed: " + e.message); }
  };

  const deleteProfile = async (profile) => {
    if (!confirm(`Delete "${profile.fileName}" and every mapping made from it?`)) return;
    try {
      await sourceProfilesTable.remove(profile.id);
      const gone = new Set(columns.filter((c) => c.profileId === profile.id).map((c) => c.id));
      setProfiles(profiles.filter((p) => p.id !== profile.id));
      setColumns(columns.filter((c) => c.profileId !== profile.id));
      setMappings(mappings.filter((m) => !gone.has(m.sourceColumnId)));
    } catch (e) { alert("Delete failed: " + e.message); }
  };

  /* ---------- per-row decisions ---------- */
  const upsertMappingState = (u) => setMappings((prev) => (prev.some((m) => m.id === u.id) ? prev.map((m) => (m.id === u.id ? u : m)) : [...prev, u]));

  const setTarget = async (col, targetFieldId) => {
    try {
      const existing = mappingByColumn.get(col.id);
      if (!targetFieldId) {
        if (existing) { await fieldMappingsTable.remove(existing.id); setMappings(mappings.filter((m) => m.id !== existing.id)); }
        return;
      }
      const tf = fieldById.get(targetFieldId);
      const tc = typeCheck(col.inferredType, tf.dataType);
      const base = { projectId: project.id, sourceColumnId: col.id, targetFieldId, status: "confirmed", matchMethod: "manual", typeCheck: tc };
      const u = existing ? await fieldMappingsTable.update(existing.id, { ...existing, ...base }) : await fieldMappingsTable.create(base);
      upsertMappingState(u);
      await ensureScope([tf.entityId]);
    } catch (e) { alert("Update failed: " + e.message); }
  };

  const setStatus = async (col, status) => {
    try {
      const existing = mappingByColumn.get(col.id);
      if (!existing) {
        if (status === "rejected") upsertMappingState(await fieldMappingsTable.create({ projectId: project.id, sourceColumnId: col.id, targetFieldId: null, status: "rejected", matchMethod: "manual", typeCheck: "unknown" }));
        return;
      }
      if (status === "suggested" && !existing.targetFieldId) {
        await fieldMappingsTable.remove(existing.id);
        setMappings(mappings.filter((m) => m.id !== existing.id));
        return;
      }
      upsertMappingState(await fieldMappingsTable.update(existing.id, { ...existing, status }));
      if (status === "confirmed" && existing.targetFieldId) await ensureScope([fieldById.get(existing.targetFieldId)?.entityId]);
    } catch (e) { alert("Update failed: " + e.message); }
  };

  const setTransformation = async (m, value) => {
    try { upsertMappingState(await fieldMappingsTable.update(m.id, { ...m, transformation: value })); }
    catch (e) { alert("Update failed: " + e.message); }
  };

  const confirmSafeMatches = async (profileId) => {
    const ids = new Set(columns.filter((c) => c.profileId === profileId).map((c) => c.id));
    const todo = mappings.filter((m) => ids.has(m.sourceColumnId) && m.status === "suggested" && (m.matchMethod === "exact" || m.matchMethod === "synonym") && m.typeCheck !== "conflict" && !matchInfo.get(m.sourceColumnId)?.ambiguous);
    if (!todo.length) { setMessage("No exact or synonym matches are waiting. Ambiguous matches and type conflicts are left for you to review one by one."); return; }
    try {
      await fieldMappingsTable.confirmMany(todo.map((m) => m.id));
      const set = new Set(todo.map((m) => m.id));
      setMappings((prev) => prev.map((m) => (set.has(m.id) ? { ...m, status: "confirmed" } : m)));
      await ensureScope(todo.map((m) => fieldById.get(m.targetFieldId)?.entityId));
      setMessage(`Confirmed ${todo.length} exact/synonym matches. Ambiguous matches and type conflicts were skipped.`);
    } catch (e) { alert("Confirm failed: " + e.message); }
  };

  /* ---------- optional AI suggestions (user-triggered) ---------- */
  const askAI = async (profile) => {
    const cols = columns.filter((c) => c.profileId === profile.id && !mappingByColumn.has(c.id));
    if (!cols.length) { setMessage("No unmapped columns to ask about."); return; }
    setAiBusy(profile.id);
    try {
      const targetList = model.fields.map((f) => `${entityById.get(f.entityId)?.name}.${f.name} (${f.dataType})${f.description ? ": " + f.description : ""}`).join("\n");
      let proposed = 0;
      for (let i = 0; i < cols.length; i += 25) {
        const chunk = cols.slice(i, i + 25);
        const colList = chunk.map((c) => {
          const s = includeSamples ? samplesRef.current.get(c.id) : null;
          return `${c.sheetName || "-"} | ${c.name} | ${c.inferredType}${s && s.length ? " | e.g. " + s.join(", ") : ""}`;
        }).join("\n");
        const result = await callClaude(
          `You are helping map a customer's source data columns onto a target data model for a software implementation.
Target model, one per line as Entity.field (type): description
${targetList}

Source columns, one per line as sheet | column | inferred type${includeSamples ? " | example values" : ""}:
${colList}

Return ONLY raw JSON, an array, no markdown fences. One object per source column that has a plausible target:
[{"sheet":"","column":"","entity":"","field":"","reason":"at most 12 words"}]
Use the exact sheet, column, entity and field names given above. Omit any column with no good target. Never invent entities or fields that are not in the target model.`
        );
        const rows = [];
        for (const r of Array.isArray(result) ? result : []) {
          const col = chunk.find((c) => c.name === r.column && (c.sheetName || "-") === (r.sheet || "-")) || chunk.find((c) => c.name === r.column);
          const tf = model.fields.find((f) => f.name.toLowerCase() === String(r.field).toLowerCase() && entityById.get(f.entityId)?.name.toLowerCase() === String(r.entity).toLowerCase());
          if (!col || !tf || rows.some((x) => x.sourceColumnId === col.id)) continue;
          rows.push({ projectId: project.id, sourceColumnId: col.id, targetFieldId: tf.id, status: "suggested", matchMethod: "ai", typeCheck: typeCheck(col.inferredType, tf.dataType), notes: String(r.reason || "").slice(0, 200) });
        }
        const created = await fieldMappingsTable.createMany(rows);
        setMappings((prev) => [...prev, ...created]);
        proposed += created.length;
      }
      setMessage(`AI proposed ${proposed} of ${cols.length} unmapped columns. They are marked AI and need your confirmation like any other suggestion.`);
    } catch (e) { alert("AI suggestion failed: " + e.message); }
    finally { setAiBusy(null); }
  };

  /* ---------- push confirmed mappings into the Data Specification ---------- */
  const pushToSpec = async (entityIds) => {
    try {
      const existingEntities = await dataSpecEntitiesTable.list({ project_id: project.id });
      let added = 0, skipped = 0, touched = 0;
      for (const entityId of entityIds) {
        const te = entityById.get(entityId);
        const confirmed = mappings.filter((m) => m.status === "confirmed" && m.targetFieldId && fieldById.get(m.targetFieldId)?.entityId === entityId);
        if (!te || !confirmed.length) continue;
        let spec = existingEntities.find((x) => x.name.toLowerCase() === te.name.toLowerCase());
        if (!spec) {
          spec = await dataSpecEntitiesTable.create({ projectId: project.id, name: te.name, direction: "Input", frequency: "", apiType: "", refreshType: "", description: te.description || "" });
          existingEntities.push(spec);
        }
        const specFields = await dataSpecFieldsTable.list({ entity_id: spec.id });
        const have = new Set(specFields.map((f) => f.fieldName.toLowerCase()));
        const byTarget = new Map();
        confirmed.forEach((m) => { if (!byTarget.has(m.targetFieldId)) byTarget.set(m.targetFieldId, []); byTarget.get(m.targetFieldId).push(m); });
        let order = specFields.length;
        let any = false;
        for (const [tfId, ms] of byTarget) {
          const tf = fieldById.get(tfId);
          if (have.has(tf.name.toLowerCase())) { skipped++; continue; }
          const srcNames = ms.map((m) => { const c = columnsById.get(m.sourceColumnId); return c ? `${c.sheetName ? c.sheetName + "." : ""}${c.name}` : ""; }).filter(Boolean).join(", ");
          const transforms = ms.map((m) => m.transformation).filter(Boolean).join("; ");
          await dataSpecFieldsTable.create({
            entityId: spec.id, fieldName: tf.name, sourceFieldName: srcNames, description: tf.description, dataType: tf.dataType,
            isPrimaryKey: tf.isKey, allowNull: !tf.required, comments: transforms, exampleValues: "", orderIndex: order++,
          });
          added++; any = true;
        }
        if (any) touched++;
      }
      setMessage(`Data Specification updated: ${added} field(s) added across ${touched} entit${touched === 1 ? "y" : "ies"}${skipped ? `, ${skipped} already present and left alone` : ""}.`);
      onSpecChanged && onSpecChanged();
    } catch (e) { alert("Couldn't add to the Data Specification: " + e.message); }
  };

  /* ---------- render ---------- */
  if (loading) return <div className="text-sm text-slate-500 font-mono">Loading...</div>;

  if (models.length === 0) {
    return <EmptyState text="No Data Model yet. Open Data Model in the left menu and create or import one, then come back here to map customer data onto it." />;
  }

  const confirmedEntityIds = [...new Set(mappings.filter((m) => m.status === "confirmed" && m.targetFieldId).map((m) => fieldById.get(m.targetFieldId)?.entityId).filter(Boolean))]
    .filter((id) => model.entities.some((e) => e.id === id));
  const modelOptions = models.length > 1;

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4 max-w-3xl">
        Upload what the customer sends (a data file, or a spreadsheet that lists their fields). Columns are profiled in your browser and matched to your Data Model by fixed rules. You confirm each mapping, and confirmed mappings can be added to this project's Data Specification.
      </p>

      {message && <div className="text-xs text-teal-200 bg-teal-500/10 border border-teal-500/30 rounded-md p-3 mb-4 flex justify-between gap-3"><span>{message}</span><button onClick={() => setMessage("")} className="text-slate-400 hover:text-slate-200"><X size={14} /></button></div>}

      {/* Coverage */}
      <div className="border border-slate-800 rounded-lg bg-slate-900/50 p-4 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 font-mono mb-1">Mapping coverage</div>
            {coverage.overall.requiredTotal === 0 ? (
              <div className="text-sm text-slate-400">Tick the entities that are in scope below to see coverage.</div>
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold text-slate-100">{coverage.overall.pct}%</span>
                <span className="text-xs text-slate-400">{coverage.overall.requiredMapped} of {coverage.overall.requiredTotal} required fields have a confirmed mapping</span>
              </div>
            )}
            {coverage.suggestedPending > 0 && <div className="text-xs text-amber-300 mt-1">{coverage.suggestedPending} suggested mapping(s) are not counted until you confirm them.</div>}
          </div>
          <div className="flex items-center gap-3">
            {modelOptions && (
              <select className={inputCls + " text-xs"} value={modelId || ""} onChange={(e) => setModelId(e.target.value)}>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-x-6 gap-y-1 mb-3">
          {model.entities.map((en) => {
            const inScope = scopeIds.includes(en.id);
            const row = coverage.entities.find((x) => x.entityId === en.id);
            return (
              <label key={en.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                <input type="checkbox" checked={inScope} onChange={() => toggleScope(en.id)} />
                <span className="text-slate-200 w-28 truncate" title={en.name}>{en.name}</span>
                {inScope && row ? (
                  row.requiredTotal ? (
                    <>
                      <span className="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden"><span className="block h-full bg-teal-500" style={{ width: `${row.pct}%` }} /></span>
                      <span className="font-mono text-slate-400 w-14 text-right">{row.requiredMapped}/{row.requiredTotal}</span>
                    </>
                  ) : <span className="text-slate-600 font-mono">no required fields</span>
                ) : <span className="text-slate-600 font-mono">not in scope</span>}
              </label>
            );
          })}
        </div>

        {coverage.gaps.length > 0 && (
          <details className="mb-2">
            <summary className="text-xs text-rose-300 cursor-pointer">{coverage.gaps.length} required field(s) with no confirmed mapping</summary>
            <ul className="mt-2 text-xs text-slate-400 font-mono columns-1 md:columns-2">
              {coverage.gaps.map((g) => <li key={g.fieldId}>{g.entityName}.{g.fieldName}</li>)}
            </ul>
          </details>
        )}
        {coverage.flags.length > 0 && (
          <details open>
            <summary className="text-xs text-amber-300 cursor-pointer">{coverage.flags.length} quality flag(s)</summary>
            <ul className="mt-2 text-xs text-slate-400 space-y-1">
              {coverage.flags.map((f, i) => <li key={i}>• {f.text}</li>)}
            </ul>
          </details>
        )}

        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer">Matching and flag settings</summary>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400 items-center">
            <label className="flex items-center gap-2">Fuzzy match threshold
              <input type="number" min="0.3" max="1" step="0.05" value={thresholds.fuzzyJaccard} onChange={(e) => setThresholds({ ...thresholds, fuzzyJaccard: Number(e.target.value) || DEFAULT_THRESHOLDS.fuzzyJaccard })} className={inputCls + " w-20"} />
            </label>
            <label className="flex items-center gap-2">Flag required fields with more than
              <input type="number" min="0" max="100" step="5" value={quality.highNullPct} onChange={(e) => setQuality({ ...quality, highNullPct: Number(e.target.value) })} className={inputCls + " w-20"} /> % empty values
            </label>
          </div>
          <p className="text-[11px] text-slate-600 mt-2">Both defaults are starting guesses, not validated against real projects. The match threshold applies the next time matching runs; the flag setting applies immediately. These settings reset when you leave the page.</p>
        </details>
      </div>

      {/* Add to Data Specification */}
      {confirmedEntityIds.length > 0 && (
        <div className="border border-slate-800 rounded-lg bg-slate-900/50 p-4 mb-5">
          <div className="text-xs uppercase tracking-wide text-slate-400 font-mono mb-2">Add confirmed mappings to the Data Specification</div>
          <div className="flex flex-wrap gap-2">
            {confirmedEntityIds.map((id) => (
              <button key={id} onClick={() => pushToSpec([id])} className="text-xs px-3 py-1.5 rounded-md border border-teal-500/30 text-teal-300 bg-teal-500/10 hover:bg-teal-500/20">{entityById.get(id)?.name}</button>
            ))}
            <button onClick={() => pushToSpec(confirmedEntityIds)} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Add all</button>
          </div>
          <p className="text-[11px] text-slate-600 mt-2">Creates the entity if it does not exist yet and adds one field per mapped target field. Fields already in the specification are left alone, so this is safe to repeat.</p>
        </div>
      )}

      {/* Upload */}
      <div className="border border-slate-800 rounded-lg bg-slate-900/50 p-4 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs uppercase tracking-wide text-slate-400 font-mono">Source files</div>
          <label className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 cursor-pointer border border-teal-500/30 rounded-md px-3 py-1.5 bg-teal-500/10">
            <Upload size={13} /> {reading ? "Reading..." : "Profile a file (.xlsx, .csv)"}
            <input type="file" accept=".xlsx,.csv" className="hidden" disabled={reading} onChange={(e) => handleFile(e)} />
          </label>
        </div>
        <p className="text-[11px] text-slate-600 mt-2">The file is read in your browser. Only column names, types, empty-value percentages and distinct counts are saved. Row data is never uploaded or stored. Do not rely on this for files you are not allowed to open on this computer.</p>

        {pending && (
          <div className="mt-4 border border-slate-700 rounded-md p-3 bg-slate-950">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="text-sm text-slate-100">{pending.file.name}</span>
              <span className="text-xs text-slate-500 font-mono">
                {pending.result.mode === "field_list" ? "reads as a list of fields" : `${pending.result.rowCount.toLocaleString()} rows profiled`}
                {pending.result.truncated ? " (row cap reached, stats are from the first rows only)" : ""}
              </span>
              <select className={inputCls + " w-auto text-xs"} value={pending.mode} onChange={(e) => handleFile(null, e.target.value, pending.file)}>
                <option value="auto">Auto-detect layout</option>
                <option value="data">Treat as a data file</option>
                <option value="field_list">Treat as a list of fields</option>
              </select>
              <input className={inputCls + " w-56 text-xs"} placeholder="Source system (e.g. SAP, NetSuite)" value={pending.sourceSystem} onChange={(e) => setPending({ ...pending, sourceSystem: e.target.value })} />
            </div>
            {pending.result.sheets.map((s) => (
              <div key={s.sheetName} className="mb-3">
                <div className="text-xs text-slate-400 font-mono mb-1">Sheet: {s.sheetName} · {s.columns.length} columns</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 font-mono uppercase"><tr><th className="text-left py-1">Column</th><th className="text-left py-1">Type</th><th className="text-left py-1">Empty %</th><th className="text-left py-1">Distinct</th><th className="text-left py-1">Examples (not saved)</th></tr></thead>
                    <tbody>
                      {s.columns.map((c, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          <td className="py-1 pr-3 text-slate-200">{c.name}</td>
                          <td className="py-1 pr-3 text-slate-400">{c.inferredType}</td>
                          <td className="py-1 pr-3 text-slate-400">{c.nullPct === null ? "n/a" : c.nullPct + "%"}{c.allEmpty ? " (all empty)" : ""}</td>
                          <td className="py-1 pr-3 text-slate-400">{c.distinctCount === null ? "n/a" : c.distinctCount.toLocaleString() + (c.distinctCapped ? "+" : "")}</td>
                          <td className="py-1 text-slate-500 truncate max-w-[260px]">{(c.samples || []).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={saveProfile} disabled={saving} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400 disabled:opacity-50">{saving ? "Saving..." : "Save profile and run matching"}</button>
              <button onClick={() => setPending(null)} className="text-xs px-3 py-1.5 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-900">Discard</button>
            </div>
          </div>
        )}
      </div>

      {/* Review */}
      {profiles.length === 0 && !pending ? <EmptyState text="No source files profiled for this project yet." /> : (
        <>
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="text-slate-500 font-mono uppercase">Show</span>
            {[["all", "All"], ["review", "Needs review"], ["confirmed", "Confirmed"], ["unmapped", "Unmapped"], ["rejected", "Rejected"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-2 py-1 rounded border ${filter === k ? "border-teal-500/40 text-teal-300 bg-teal-500/10" : "border-slate-700 text-slate-400 hover:bg-slate-900"}`}>{label}</button>
            ))}
          </div>
          {profiles.map((profile) => {
            const pcols = columns.filter((c) => c.profileId === profile.id).sort((a, b) => a.sortOrder - b.sortOrder);
            const unmappedCount = pcols.filter((c) => !mappingByColumn.has(c.id)).length;
            const visible = pcols.filter((c) => {
              const m = mappingByColumn.get(c.id);
              if (filter === "review") return m?.status === "suggested";
              if (filter === "confirmed") return m?.status === "confirmed";
              if (filter === "rejected") return m?.status === "rejected";
              if (filter === "unmapped") return !m;
              return true;
            });
            return (
              <div key={profile.id} className="border border-slate-800 rounded-lg bg-slate-900/50 mb-4">
                <div className="flex items-center flex-wrap gap-3 px-4 py-3 border-b border-slate-800">
                  <div className="flex-1 min-w-[200px]">
                    <span className="text-sm text-slate-100 font-medium">{profile.fileName}</span>
                    <span className="text-xs text-slate-500 ml-2 font-mono">{profile.sourceSystem || "source system not set"} · {profile.mode === "field_list" ? "field list" : `${(profile.rowCount || 0).toLocaleString()} rows`} · {pcols.length} columns · inbound</span>
                  </div>
                  <button onClick={() => confirmSafeMatches(profile.id)} className="text-xs px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">Confirm exact and synonym matches</button>
                  <button onClick={() => rematch(profile.id)} className="text-xs px-2.5 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-900" title="Useful after you add synonyms in the Data Model">Re-run rules on unmapped</button>
                  <button title="Delete this file and its mappings" onClick={() => deleteProfile(profile)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
                </div>
                {unmappedCount > 0 && (
                  <div className="flex items-center flex-wrap gap-3 px-4 py-2 border-b border-slate-800 text-xs text-slate-400">
                    <span>{unmappedCount} column(s) have no suggestion.</span>
                    <AIButton onClick={() => askAI(profile)} busy={aiBusy === profile.id} label={`Ask AI about ${unmappedCount}`} />
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={includeSamples} onChange={(e) => setIncludeSamples(e.target.checked)} />
                      Include example values in the request
                    </label>
                    <span className="text-slate-600">{includeSamples ? "Example values are sent to the AI provider. Only available for files profiled in this session." : "Only column names and types are sent."}</span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[860px]">
                    <thead className="text-slate-500 font-mono uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Source column</th><th className="text-left py-2">Type</th><th className="text-left py-2">Empty</th>
                        <th className="text-left py-2">Maps to</th><th className="text-left py-2">How</th><th className="text-left py-2">Types</th>
                        <th className="text-left py-2">Transformation</th><th className="text-left py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-4 text-slate-600">Nothing matches this filter.</td></tr>}
                      {visible.map((c) => {
                        const m = mappingByColumn.get(c.id);
                        const info = matchInfo.get(c.id);
                        const showAmb = m && m.status === "suggested" && (m.matchMethod === "exact" || m.matchMethod === "synonym" || m.matchMethod === "fuzzy") && info?.ambiguous;
                        return (
                          <tr key={c.id} className="border-t border-slate-800 align-top">
                            <td className="px-4 py-2 text-slate-200">{c.sheetName && <span className="text-slate-500">{c.sheetName}.</span>}{c.name}</td>
                            <td className="py-2 pr-3 text-slate-400">{c.inferredType}</td>
                            <td className="py-2 pr-3 text-slate-400">{c.nullPct === null ? "n/a" : c.nullPct + "%"}</td>
                            <td className="py-1 pr-3">
                              <select className={inputCls + " text-xs"} value={m?.targetFieldId || ""} onChange={(e) => setTarget(c, e.target.value)} disabled={m?.status === "rejected" && !m.targetFieldId}>
                                <option value="">{m?.status === "rejected" && !m.targetFieldId ? "(rejected: not mapped)" : "— unmapped —"}</option>
                                {model.entities.map((en) => (
                                  <optgroup key={en.id} label={en.name}>
                                    {model.fields.filter((f) => f.entityId === en.id).map((f) => <option key={f.id} value={f.id}>{f.name}{f.required ? " *" : ""} ({f.dataType})</option>)}
                                  </optgroup>
                                ))}
                              </select>
                              {showAmb && (
                                <div className="text-[10px] text-amber-300 mt-1" title="Several target fields match equally well. Pick the right one.">
                                  Ambiguous. Also: {(info.alternatives || []).slice(0, 3).map((a) => fieldLabel(a.fieldId)).join(", ") || "other equal matches"}
                                </div>
                              )}
                              {m?.matchMethod === "ai" && m.notes && <div className="text-[10px] text-violet-300 mt-1">{m.notes}</div>}
                            </td>
                            <td className="py-2 pr-3">{m?.matchMethod && <Pill cls={METHOD_STYLE[m.matchMethod]}>{m.matchMethod}</Pill>}</td>
                            <td className={`py-2 pr-3 font-mono ${m ? CHECK_STYLE[m.typeCheck] : ""}`}>{m?.targetFieldId ? m.typeCheck : ""}</td>
                            <td className="py-1 pr-3">{m?.targetFieldId && <BlurInput className={inputCls + " text-xs"} value={m.transformation} placeholder="e.g. trim, uppercase" onCommit={(v) => setTransformation(m, v)} />}</td>
                            <td className="py-2 pr-4 whitespace-nowrap">
                              {m && <Pill cls={STATUS_STYLE[m.status]}>{m.status}</Pill>}
                              <span className="ml-2 inline-flex gap-1 align-middle">
                                {m?.targetFieldId && m.status !== "confirmed" && <button title="Confirm" onClick={() => setStatus(c, "confirmed")} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>}
                                {m?.status !== "rejected" && <button title="Reject / not needed" onClick={() => setStatus(c, "rejected")} className="text-slate-500 hover:text-rose-400"><X size={14} /></button>}
                                {m?.status === "rejected" && <button title="Undo reject" onClick={() => setStatus(c, "suggested")} className="text-xs text-slate-400 hover:text-slate-200 underline">undo</button>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
