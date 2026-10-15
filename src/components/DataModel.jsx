import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Download, Upload } from "lucide-react";
import { Field, EmptyState, inputCls } from "./ui";
import { targetModelsTable, targetEntitiesTable, targetFieldsTable } from "../lib/storage";
import { STARTER_MODEL } from "../lib/starterModel";
import { DATA_TYPES } from "../lib/profile";
import { exportModelXlsx, importModelFile } from "../lib/modelIO";

// Text input that keeps its own draft and saves on blur, so typing doesn't fire a
// database write per keystroke.
export function BlurInput({ value, onCommit, className = inputCls, ...rest }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  return (
    <input
      {...rest}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value ?? "")) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

const synToText = (arr) => (arr || []).join("; ");
const textToSyn = (t) => t.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

export default function DataModel() {
  const [models, setModels] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [entities, setEntities] = useState([]);
  const [fields, setFields] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);

  const loadModel = async (id) => {
    const ents = await targetEntitiesTable.list({ model_id: id });
    ents.sort((a, b) => a.sortOrder - b.sortOrder);
    const flds = await targetFieldsTable.listIn("entity_id", ents.map((e) => e.id));
    flds.sort((a, b) => a.sortOrder - b.sortOrder);
    setEntities(ents);
    setFields(flds);
  };

  useEffect(() => {
    targetModelsTable.list().then((ms) => {
      setModels(ms);
      if (ms.length) setModelId(ms[0].id);
    }).catch((e) => alert("Failed to load data models: " + e.message));
  }, []);

  useEffect(() => {
    if (modelId) loadModel(modelId).catch((e) => alert("Failed to load model: " + e.message));
    else { setEntities([]); setFields([]); }
    setExpanded(null);
  }, [modelId]);

  const model = (models || []).find((m) => m.id === modelId);

  // Writes a whole model (entities then fields) and returns the new model row.
  const writeModel = async ({ name, description, isStarter }, entityDefs) => {
    const m = await targetModelsTable.create({ name, description, isStarter });
    const createdEntities = await targetEntitiesTable.createMany(
      entityDefs.map((e, i) => ({ modelId: m.id, name: e.name, description: e.description || "", sortOrder: i }))
    );
    const byName = new Map(createdEntities.map((e) => [e.name, e.id]));
    const fieldRows = [];
    entityDefs.forEach((e) => (e.fields || []).forEach((f, i) => fieldRows.push({
      entityId: byName.get(e.name), name: f.name, dataType: f.dataType, required: f.required, isKey: f.isKey,
      description: f.description, synonyms: f.synonyms, sortOrder: i,
    })));
    await targetFieldsTable.createMany(fieldRows);
    return m;
  };

  const adopt = (m) => { setModels((prev) => [...(prev || []), m]); setModelId(m.id); };

  const createStarter = async () => {
    setBusy(true);
    try {
      const entityDefs = STARTER_MODEL.entities.map((e) => ({
        name: e.name, description: e.description,
        fields: e.fields.map((f) => ({ name: f[0], dataType: f[1], required: f[2], isKey: f[3], description: f[4], synonyms: f[5] })),
      }));
      adopt(await writeModel({ name: STARTER_MODEL.name, description: STARTER_MODEL.description, isStarter: true }, entityDefs));
      setNotice("");
    } catch (e) { alert("Couldn't create the starter model: " + e.message); }
    finally { setBusy(false); }
  };

  const createBlank = async () => {
    const name = prompt("Name for the new data model:", "My data model");
    if (!name) return;
    try { adopt(await targetModelsTable.create({ name, description: "", isStarter: false })); setNotice(""); }
    catch (e) { alert("Create failed: " + e.message); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { entities: defs, warnings } = await importModelFile(file);
      adopt(await writeModel({ name: file.name.replace(/\.(xlsx|csv)$/i, ""), description: `Imported from ${file.name}`, isStarter: false }, defs));
      setNotice(warnings.length ? `Imported with ${warnings.length} warning(s):\n` + warnings.slice(0, 8).join("\n") : "");
    } catch (err) { alert("Import failed: " + err.message); }
    finally { setBusy(false); }
  };

  const handleExport = () => {
    const shaped = {
      name: model.name,
      entities: entities.map((en) => ({ name: en.name, fields: fields.filter((f) => f.entityId === en.id) })),
    };
    exportModelXlsx(shaped, `${model.name.replace(/[^\w-]+/g, "_")}.xlsx`);
  };

  const updateModel = async (patch) => {
    try { const u = await targetModelsTable.update(model.id, { ...model, ...patch }); setModels(models.map((m) => (m.id === u.id ? u : m))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const deleteModel = async () => {
    if (!confirm(`Delete "${model.name}"? This also deletes every field mapping, in every project, that points at its fields.`)) return;
    try {
      await targetModelsTable.remove(model.id);
      const rest = models.filter((m) => m.id !== model.id);
      setModels(rest);
      setModelId(rest[0]?.id || null);
    } catch (e) { alert("Delete failed: " + e.message); }
  };

  const addEntity = async () => {
    try {
      const en = await targetEntitiesTable.create({ modelId, name: "New entity", description: "", sortOrder: entities.length });
      setEntities([...entities, en]);
      setExpanded(en.id);
    } catch (e) { alert("Create failed: " + e.message); }
  };
  const updateEntity = async (en, patch) => {
    try { const u = await targetEntitiesTable.update(en.id, { ...en, ...patch }); setEntities(entities.map((x) => (x.id === u.id ? u : x))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const removeEntity = async (en) => {
    if (!confirm(`Delete "${en.name}" and all its fields? Mappings that point at those fields are deleted too.`)) return;
    try {
      await targetEntitiesTable.remove(en.id);
      setEntities(entities.filter((x) => x.id !== en.id));
      setFields(fields.filter((f) => f.entityId !== en.id));
    } catch (e) { alert("Delete failed: " + e.message); }
  };

  const addField = async (entityId) => {
    const mine = fields.filter((f) => f.entityId === entityId);
    try {
      const f = await targetFieldsTable.create({ entityId, name: "new_field", dataType: "string", required: false, isKey: false, description: "", synonyms: [], sortOrder: mine.length });
      setFields([...fields, f]);
    } catch (e) { alert("Create failed: " + e.message); }
  };
  const updateField = async (f, patch) => {
    try { const u = await targetFieldsTable.update(f.id, { ...f, ...patch }); setFields(fields.map((x) => (x.id === u.id ? u : x))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const removeField = async (f) => {
    if (!confirm(`Delete field "${f.name}"? Mappings that point at it are deleted too.`)) return;
    try { await targetFieldsTable.remove(f.id); setFields(fields.filter((x) => x.id !== f.id)); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  if (models === null) return <div className="text-sm text-slate-500 font-mono">Loading...</div>;

  const importInput = <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleImport} />;

  if (models.length === 0) {
    return (
      <div>
        <h2 className="text-base font-semibold mb-1">Data Model</h2>
        <p className="text-xs text-slate-500 mb-5 max-w-2xl">
          Your own canonical data model: the entities and fields that customer data gets mapped onto. Mappings are made per project in Data Specification. Start from a generic model and edit it, import your product's model from a spreadsheet, or start blank.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={createStarter} disabled={busy} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">{busy ? "Working..." : "Create generic starter model"}</button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20">Import from .xlsx / .csv</button>
          <button onClick={createBlank} className="px-3 py-1.5 rounded-md text-xs font-medium border border-slate-700 text-slate-300 hover:bg-slate-900">Start blank</button>
        </div>
        <p className="text-xs text-slate-600 mt-3 font-mono">Import format: columns Entity, Field, Type, Required, Key, Description, Synonyms.</p>
        {importInput}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h2 className="text-base font-semibold">Data Model</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={createBlank} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-slate-700 text-slate-300 hover:bg-slate-900"><Plus size={13} /> New model</button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-slate-700 text-slate-300 hover:bg-slate-900"><Upload size={13} /> Import</button>
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-slate-700 text-slate-300 hover:bg-slate-900"><Download size={13} /> Export .xlsx</button>
          {importInput}
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-2xl">The canonical entities and fields customer data is mapped onto. Synonyms feed the automatic matching in Data Specification, so add the names customers actually use. Edits save when you leave a field.</p>

      {notice && <pre className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4 whitespace-pre-wrap font-mono">{notice}</pre>}

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Field label="Model">
          <select className={inputCls} value={modelId || ""} onChange={(e) => setModelId(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        {model && (
          <>
            <Field label="Name"><BlurInput value={model.name} onCommit={(v) => v.trim() && updateModel({ name: v.trim() })} /></Field>
            <Field label="Description"><BlurInput value={model.description} onCommit={(v) => updateModel({ description: v })} /></Field>
          </>
        )}
      </div>
      {model && <button onClick={deleteModel} className="text-xs text-slate-500 hover:text-rose-400 mb-4 inline-flex items-center gap-1"><Trash2 size={12} /> Delete this model</button>}

      <div className="flex gap-2 mb-3">
        <button onClick={addEntity} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400"><Plus size={14} /> Add entity</button>
      </div>

      {entities.length === 0 ? <EmptyState text="No entities in this model yet." /> : (
        <div className="space-y-2">
          {entities.map((en) => {
            const efields = fields.filter((f) => f.entityId === en.id);
            const reqCount = efields.filter((f) => f.required).length;
            return (
              <div key={en.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button onClick={() => setExpanded(expanded === en.id ? null : en.id)} className="flex-1 text-left">
                    <span className="text-sm text-slate-100 font-medium">{en.name}</span>
                    <span className="text-xs text-slate-500 ml-2 font-mono">{efields.length} fields · {reqCount} required</span>
                  </button>
                  <button onClick={() => removeEntity(en)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
                </div>
                {expanded === en.id && (
                  <div className="px-4 pb-4">
                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <BlurInput value={en.name} placeholder="Entity name" onCommit={(v) => v.trim() && updateEntity(en, { name: v.trim() })} />
                      <BlurInput value={en.description} placeholder="Description" onCommit={(v) => updateEntity(en, { description: v })} />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs mb-2 min-w-[760px]">
                        <thead className="text-slate-500 font-mono uppercase">
                          <tr><th className="text-left py-1">Field</th><th className="text-left py-1">Type</th><th className="text-left py-1">Req</th><th className="text-left py-1">Key</th><th className="text-left py-1">Description</th><th className="text-left py-1">Synonyms (; separated)</th><th></th></tr>
                        </thead>
                        <tbody>
                          {efields.map((f) => (
                            <tr key={f.id} className="border-t border-slate-800 align-top">
                              <td className="py-1 pr-2"><BlurInput value={f.name} onCommit={(v) => v.trim() && updateField(f, { name: v.trim() })} /></td>
                              <td className="py-1 pr-2">
                                <select className={inputCls} value={f.dataType} onChange={(e) => updateField(f, { dataType: e.target.value })}>{DATA_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                              </td>
                              <td className="py-2 pr-2"><input type="checkbox" checked={f.required} onChange={(e) => updateField(f, { required: e.target.checked })} /></td>
                              <td className="py-2 pr-2"><input type="checkbox" checked={f.isKey} onChange={(e) => updateField(f, { isKey: e.target.checked })} /></td>
                              <td className="py-1 pr-2"><BlurInput value={f.description} onCommit={(v) => updateField(f, { description: v })} /></td>
                              <td className="py-1 pr-2"><BlurInput value={synToText(f.synonyms)} onCommit={(v) => updateField(f, { synonyms: textToSyn(v) })} /></td>
                              <td className="py-2"><button onClick={() => removeField(f)} className="text-slate-500 hover:text-rose-400"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => addField(en.id)} className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"><Plus size={12} /> Add field</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
