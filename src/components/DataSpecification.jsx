import React, { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, AIButton, EmptyState, inputCls } from "./ui";
import { dataSpecEntitiesTable, dataSpecFieldsTable } from "../lib/storage";
import { callClaude } from "../lib/ai";
import { extractFile } from "../lib/fileExtract";
import Mappings from "./Mappings";

export default function DataSpecification({ projects }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("entities");

  const loadEntities = () => dataSpecEntitiesTable.list({ project_id: projectId }).then(setEntities);

  useEffect(() => {
    if (!projectId) { setEntities([]); return; }
    setLoading(true);
    loadEntities().finally(() => setLoading(false));
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId);

  if (projects.length === 0) {
    return <div className="text-sm text-slate-500 border border-dashed border-slate-800 rounded-lg py-10 text-center">No projects yet — create one in Portfolio first.</div>;
  }

  const tabCls = (v) => `px-3 py-1.5 text-xs rounded-md border ${view === v ? "border-teal-500/40 text-teal-300 bg-teal-500/10" : "border-slate-700 text-slate-400 hover:bg-slate-900"}`;

  return (
    <div>
      <Field label="Project">
        <select className={inputCls + " max-w-xs"} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="flex gap-2 mb-4">
        <button className={tabCls("entities")} onClick={() => setView("entities")}>Entities and fields</button>
        <button className={tabCls("mappings")} onClick={() => setView("mappings")}>Mappings to your Data Model</button>
      </div>
      {view === "entities" && (loading ? <div className="text-sm text-slate-500 font-mono">Loading...</div> : project && (
        <DataSpecInner project={project} entities={entities} setEntities={setEntities} />
      ))}
      {view === "mappings" && project && (
        <Mappings key={project.id} project={project} onSpecChanged={loadEntities} />
      )}
    </div>
  );
}

function DataSpecInner({ project, entities, setEntities }) {
  const [fieldsByEntity, setFieldsByEntity] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [context, setContext] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [draftEntities, setDraftEntities] = useState(null);

  const loadFields = async (entityId) => {
    if (fieldsByEntity[entityId]) { setExpanded(expanded === entityId ? null : entityId); return; }
    const fields = await dataSpecFieldsTable.list({ entity_id: entityId });
    setFieldsByEntity((prev) => ({ ...prev, [entityId]: fields.sort((a, b) => a.orderIndex - b.orderIndex) }));
    setExpanded(entityId);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExtracting(true);
    try {
      const { text, truncated } = await extractFile(file);
      setContext((c) => (c ? `${c}\n\n--- ${file.name} ---\n${text}` : text) + (truncated ? "\n[truncated]" : ""));
    } catch (err) {
      alert("Couldn't read that file: " + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const result = await callClaude(
        `You are drafting a Data Specification for a B2B SaaS implementation project — the structured spec of every data flow between the customer and this system.
Project: ${project.name}, vertical: ${project.vertical}, notes: ${project.notes || "none"}
Additional discovery context: ${context || "none"}

Return ONLY raw JSON, an array, no markdown fences. Propose the realistic data entities (e.g. Customer, Product, Order, Transaction) involved, each with its fields:
[{
  "name": "entity name, e.g. Customer",
  "direction": "Input or Output",
  "frequency": "e.g. Weekly, Daily, On-demand",
  "apiType": "e.g. REST API, SFTP file, Batch upload",
  "refreshType": "Replace, Upsert, Incremental, or Full Refresh",
  "estimatedRows": 0,
  "description": "one sentence",
  "fields": [{"fieldName":"","description":"","dataType":"","isPrimaryKey":false,"allowNull":true,"exampleValues":""}]
}]
3-5 entities, each with 4-6 realistic fields including a primary key. Base this on genuinely likely data flows for this vertical and use case, not generic placeholders. Keep descriptions to one short sentence each — this needs to fit in a single response.`
      );
      setDraftEntities(Array.isArray(result) ? result : []);
    } catch (e) { alert("Suggestion failed: " + e.message); }
    finally { setSuggesting(false); }
  };

  const saveDrafts = async () => {
    try {
      const created = [];
      for (const de of draftEntities) {
        const entity = await dataSpecEntitiesTable.create({
          projectId: project.id, name: de.name, direction: de.direction, frequency: de.frequency,
          apiType: de.apiType, refreshType: de.refreshType, estimatedRows: de.estimatedRows, description: de.description,
        });
        created.push(entity);
        const fields = [];
        for (let i = 0; i < (de.fields || []).length; i++) {
          const f = de.fields[i];
          fields.push(await dataSpecFieldsTable.create({ entityId: entity.id, fieldName: f.fieldName, description: f.description, dataType: f.dataType, isPrimaryKey: f.isPrimaryKey, allowNull: f.allowNull, exampleValues: f.exampleValues, orderIndex: i }));
        }
        setFieldsByEntity((prev) => ({ ...prev, [entity.id]: fields }));
      }
      setEntities([...entities, ...created]);
      setDraftEntities(null);
      setShowSuggest(false);
      setContext("");
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const addEntity = async () => {
    try {
      const entity = await dataSpecEntitiesTable.create({ projectId: project.id, name: "New entity", direction: "Input", frequency: "", apiType: "", refreshType: "", description: "" });
      setEntities([...entities, entity]);
      setFieldsByEntity((prev) => ({ ...prev, [entity.id]: [] }));
      setExpanded(entity.id);
    } catch (e) { alert("Create failed: " + e.message); }
  };
  const updateEntity = async (entity, patch) => {
    try { const updated = await dataSpecEntitiesTable.update(entity.id, { ...entity, ...patch }); setEntities(entities.map((e) => (e.id === entity.id ? updated : e))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const removeEntity = async (id) => {
    if (!confirm("Delete this entity and all its fields?")) return;
    try { await dataSpecEntitiesTable.remove(id); setEntities(entities.filter((e) => e.id !== id)); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const addField = async (entityId) => {
    const fields = fieldsByEntity[entityId] || [];
    try {
      const field = await dataSpecFieldsTable.create({ entityId, fieldName: "field_name", dataType: "", isPrimaryKey: false, allowNull: true, orderIndex: fields.length });
      setFieldsByEntity((prev) => ({ ...prev, [entityId]: [...fields, field] }));
    } catch (e) { alert("Create failed: " + e.message); }
  };
  const updateField = async (entityId, field, patch) => {
    try {
      const updated = await dataSpecFieldsTable.update(field.id, { ...field, ...patch });
      setFieldsByEntity((prev) => ({ ...prev, [entityId]: prev[entityId].map((f) => (f.id === field.id ? updated : f)) }));
    } catch (e) { alert("Update failed: " + e.message); }
  };
  const removeField = async (entityId, fieldId) => {
    try { await dataSpecFieldsTable.remove(fieldId); setFieldsByEntity((prev) => ({ ...prev, [entityId]: prev[entityId].filter((f) => f.id !== fieldId) })); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">The structured spec of every data flow in and out of this implementation — one entity per data object, one row per field. This is real, queryable data, not a generated document.</p>
      <div className="flex gap-2 mb-4">
        <button onClick={addEntity} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400"><Plus size={14} /> Add entity</button>
        <button onClick={() => setShowSuggest(!showSuggest)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20">Suggest entities from discovery</button>
      </div>

      {showSuggest && (
        <div className="mb-5 p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
          <Field label="Discovery context (optional — paste or upload)">
            <textarea className={inputCls + " mb-2"} rows={3} value={context} onChange={(e) => setContext(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3 mb-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 cursor-pointer border border-teal-500/30 rounded-md px-3 py-1.5 bg-teal-500/10">
              {extracting ? "Reading..." : "Upload doc (PDF, DOCX, XLSX, image)"}
              <input type="file" accept=".pdf,.docx,.xlsx,image/*" className="hidden" disabled={extracting} onChange={handleUpload} />
            </label>
          </div>
          <AIButton onClick={suggest} busy={suggesting} label="Generate entities" />

          {draftEntities && (
            <div className="mt-4 space-y-3">
              {draftEntities.map((de, i) => (
                <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-100">{de.name}</span>
                    <span className="text-[10px] px-1.5 rounded border text-slate-400 border-slate-600">{de.direction} · {de.frequency}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-1.5">{de.description}</p>
                  <p className="text-xs text-slate-500 font-mono">{(de.fields || []).length} fields: {(de.fields || []).map((f) => f.fieldName).join(", ")}</p>
                </div>
              ))}
              <button onClick={saveDrafts} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Save all {draftEntities.length} entities</button>
            </div>
          )}
        </div>
      )}

      {entities.length === 0 ? <EmptyState text="No data entities defined yet." /> : (
        <div className="space-y-2">
          {entities.map((entity) => (
            <div key={entity.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => loadFields(entity.id)} className="flex-1 text-left">
                  <span className="text-sm text-slate-100 font-medium">{entity.name}</span>
                  <span className="text-xs text-slate-500 ml-2 font-mono">{entity.direction} · {entity.frequency || "—"} · {entity.refreshType || "—"}</span>
                </button>
                <button onClick={() => removeEntity(entity.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
              </div>
              {expanded === entity.id && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input className={inputCls} placeholder="Entity name" value={entity.name} onChange={(e) => updateEntity(entity, { name: e.target.value })} />
                    <select className={inputCls} value={entity.direction} onChange={(e) => updateEntity(entity, { direction: e.target.value })}>{["Input", "Output"].map((d) => <option key={d}>{d}</option>)}</select>
                    <input className={inputCls} placeholder="Frequency (e.g. Weekly)" value={entity.frequency} onChange={(e) => updateEntity(entity, { frequency: e.target.value })} />
                    <input className={inputCls} placeholder="API / transport type" value={entity.apiType} onChange={(e) => updateEntity(entity, { apiType: e.target.value })} />
                    <select className={inputCls} value={entity.refreshType} onChange={(e) => updateEntity(entity, { refreshType: e.target.value })}><option value="">Refresh type...</option>{["Replace", "Upsert", "Incremental", "Full Refresh"].map((r) => <option key={r}>{r}</option>)}</select>
                    <input className={inputCls} type="number" placeholder="Estimated rows" value={entity.estimatedRows || ""} onChange={(e) => updateEntity(entity, { estimatedRows: e.target.value })} />
                  </div>
                  <table className="w-full text-xs mb-2">
                    <thead className="text-slate-500 font-mono uppercase">
                      <tr><th className="text-left py-1">Field</th><th className="text-left py-1">Type</th><th className="text-left py-1">PK</th><th className="text-left py-1">Null?</th><th className="text-left py-1">Example</th><th></th></tr>
                    </thead>
                    <tbody>
                      {(fieldsByEntity[entity.id] || []).map((f) => (
                        <tr key={f.id} className="border-t border-slate-800">
                          <td className="py-1 pr-2"><input className={inputCls} value={f.fieldName} onChange={(e) => updateField(entity.id, f, { fieldName: e.target.value })} /></td>
                          <td className="py-1 pr-2"><input className={inputCls + " max-w-[100px]"} value={f.dataType} onChange={(e) => updateField(entity.id, f, { dataType: e.target.value })} /></td>
                          <td className="py-1 pr-2"><input type="checkbox" checked={f.isPrimaryKey} onChange={(e) => updateField(entity.id, f, { isPrimaryKey: e.target.checked })} /></td>
                          <td className="py-1 pr-2"><input type="checkbox" checked={f.allowNull} onChange={(e) => updateField(entity.id, f, { allowNull: e.target.checked })} /></td>
                          <td className="py-1 pr-2"><input className={inputCls} value={f.exampleValues} onChange={(e) => updateField(entity.id, f, { exampleValues: e.target.value })} /></td>
                          <td className="py-1"><button onClick={() => removeField(entity.id, f.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={12} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={() => addField(entity.id)} className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"><Plus size={12} /> Add field</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
