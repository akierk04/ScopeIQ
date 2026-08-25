import React, { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, Save, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge, Field, Modal, AIButton, EmptyState, inputCls, LEVEL_COLOR, uid } from "./ui";
import {
  milestonesTable, dependenciesTable, risksTable, scopeItemsTable, changeRequestsTable, closeoutsTable, projectsTable,
} from "../lib/storage";
import { callClaude } from "../lib/ai";
import { assessProjectHealth } from "../lib/health";

const SUBTABS = ["Overview", "Milestones", "Dependencies", "Risks", "Scope & changes", "Closeout"];

export default function ProjectDetail({ project, onBack, onUpdated, onDeleted }) {
  const [subtab, setSubtab] = useState("Overview");
  const [milestones, setMilestones] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [risks, setRisks] = useState([]);
  const [scopeItems, setScopeItems] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [closeout, setCloseout] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [m, d, r, s, c, co] = await Promise.all([
        milestonesTable.list({ project_id: project.id }),
        dependenciesTable.list({ project_id: project.id }),
        risksTable.list({ project_id: project.id }),
        scopeItemsTable.list({ project_id: project.id }),
        changeRequestsTable.list({ project_id: project.id }),
        closeoutsTable.get(project.id),
      ]);
      setMilestones(m); setDependencies(d); setRisks(r); setScopeItems(s); setChangeRequests(c); setCloseout(co);
      setLoading(false);
    })();
  }, [project.id]);

  const health = useMemo(() => assessProjectHealth({ milestones, dependencies, risks, changeRequests }), [milestones, dependencies, risks, changeRequests]);
  const mismatch = health.assessment !== project.health;

  if (loading) return <div className="text-sm text-slate-500 font-mono">Loading project...</div>;

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3"><ArrowLeft size={14} /> Back to portfolio</button>

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-100">{project.name}</h2>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500">PM:</span><Badge health={project.health} />
          <span className="text-slate-500">System:</span><Badge health={health.assessment} />
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">{project.account} · {project.vertical} · {project.stage}</p>

      {mismatch && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
          <p className="text-xs font-medium text-amber-400 mb-1.5">Health mismatch detected — PM says {project.health}, system flags {health.assessment}</p>
          <ul className="text-xs text-slate-300 list-disc pl-4 space-y-0.5">{health.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {!mismatch && health.reasons.length > 0 && (
        <div className="mb-4 p-3 bg-slate-900/50 border border-slate-800 rounded-md">
          <p className="text-xs text-slate-400 mb-1.5">System notes (doesn't change your Green rating, but worth knowing):</p>
          <ul className="text-xs text-slate-500 list-disc pl-4 space-y-0.5">{health.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-800 mb-4">
        {SUBTABS.map((t) => (
          <button key={t} onClick={() => setSubtab(t)} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${subtab === t ? "border-teal-500 text-teal-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>{t}</button>
        ))}
      </div>

      {subtab === "Overview" && <OverviewTab project={project} onUpdated={onUpdated} onDeleted={onDeleted} />}
      {subtab === "Milestones" && <MilestonesTab projectId={project.id} milestones={milestones} setMilestones={setMilestones} />}
      {subtab === "Dependencies" && <DependenciesTab projectId={project.id} dependencies={dependencies} setDependencies={setDependencies} />}
      {subtab === "Risks" && <RisksTab project={project} risks={risks} setRisks={setRisks} />}
      {subtab === "Scope & changes" && <ScopeChangesTab projectId={project.id} scopeItems={scopeItems} setScopeItems={setScopeItems} changeRequests={changeRequests} setChangeRequests={setChangeRequests} />}
      {subtab === "Closeout" && (
        <CloseoutTab
          project={project} milestones={milestones} risks={risks} changeRequests={changeRequests}
          closeout={closeout} setCloseout={setCloseout} onUpdated={onUpdated}
        />
      )}
    </div>
  );
}

/* ---------- Overview ---------- */
function OverviewTab({ project, onUpdated, onDeleted }) {
  const [form, setForm] = useState(project);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { const updated = await projectsTable.update(project.id, form); onUpdated(updated); }
    catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!confirm("Delete this project and all its milestones, dependencies, risks, scope items, and change requests? This can't be undone.")) return;
    try { await projectsTable.remove(project.id); onDeleted(); }
    catch (e) { alert("Delete failed: " + e.message); }
  };
  return (
    <div className="max-w-xl">
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Project name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Account"><input className={inputCls} value={form.account || ""} onChange={(e) => setForm({ ...form, account: e.target.value })} /></Field>
        <Field label="Vertical"><input className={inputCls} value={form.vertical || ""} onChange={(e) => setForm({ ...form, vertical: e.target.value })} /></Field>
        <Field label="Owner"><input className={inputCls} value={form.owner || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
        <Field label="Stage"><select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{["Discovery", "Scoping", "Build", "UAT", "Go-live", "Hypercare", "Closed"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Health (your call, PM-reported)"><select className={inputCls} value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value })}>{["Green", "Amber", "Red"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Start date"><input type="date" className={inputCls} value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="Target date"><input type="date" className={inputCls} value={form.targetDate || ""} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><textarea className={inputCls} rows={3} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex justify-between mt-2">
        <button onClick={remove} className="text-xs text-rose-400 hover:text-rose-300">Delete project</button>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50"><Save size={14} /> {saving ? "Saving..." : "Save changes"}</button>
      </div>
    </div>
  );
}

/* ---------- Milestones ---------- */
function MilestonesTab({ projectId, milestones, setMilestones }) {
  const [form, setForm] = useState({ name: "", dueDate: "", status: "Pending", isCritical: false, owner: "" });
  const add = async () => {
    if (!form.name.trim()) return;
    try { const created = await milestonesTable.create({ ...form, projectId }); setMilestones([...milestones, created]); setForm({ name: "", dueDate: "", status: "Pending", isCritical: false, owner: "" }); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const update = async (id, patch) => {
    try { const updated = await milestonesTable.update(id, { ...milestones.find((m) => m.id === id), ...patch }); setMilestones(milestones.map((m) => (m.id === id ? updated : m))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const remove = async (id) => { try { await milestonesTable.remove(id); setMilestones(milestones.filter((m) => m.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  return (
    <div>
      {milestones.length === 0 ? <EmptyState text="No milestones yet." /> : (
        <div className="space-y-2 mb-4">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-md">
              <input className={inputCls} value={m.name} onChange={(e) => update(m.id, { name: e.target.value })} />
              <input type="date" className={inputCls + " max-w-[150px]"} value={m.dueDate} onChange={(e) => update(m.id, { dueDate: e.target.value })} />
              <select className={inputCls + " max-w-[130px]"} value={m.status} onChange={(e) => update(m.id, { status: e.target.value })}>{["Pending", "In progress", "Done", "Blocked"].map((s) => <option key={s}>{s}</option>)}</select>
              <label className="flex items-center gap-1 text-xs text-slate-400 shrink-0"><input type="checkbox" checked={m.isCritical} onChange={(e) => update(m.id, { isCritical: e.target.checked })} /> Critical</label>
              <button onClick={() => remove(m.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5 border border-dashed border-slate-700 rounded-md">
        <input className={inputCls} placeholder="New milestone" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="date" className={inputCls + " max-w-[150px]"} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <label className="flex items-center gap-1 text-xs text-slate-400 shrink-0"><input type="checkbox" checked={form.isCritical} onChange={(e) => setForm({ ...form, isCritical: e.target.checked })} /> Critical</label>
        <button onClick={add} className="text-teal-400 hover:text-teal-300 shrink-0"><Plus size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- Dependencies ---------- */
function DependenciesTab({ projectId, dependencies, setDependencies }) {
  const [form, setForm] = useState({ name: "", owner: "", dueDate: "", status: "Pending", isBlocking: true });
  const add = async () => {
    if (!form.name.trim()) return;
    try { const created = await dependenciesTable.create({ ...form, projectId }); setDependencies([...dependencies, created]); setForm({ name: "", owner: "", dueDate: "", status: "Pending", isBlocking: true }); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const update = async (id, patch) => {
    try { const updated = await dependenciesTable.update(id, { ...dependencies.find((d) => d.id === id), ...patch }); setDependencies(dependencies.map((d) => (d.id === id ? updated : d))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const remove = async (id) => { try { await dependenciesTable.remove(id); setDependencies(dependencies.filter((d) => d.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  return (
    <div>
      {dependencies.length === 0 ? <EmptyState text="No dependencies tracked yet." /> : (
        <div className="space-y-2 mb-4">
          {dependencies.map((d) => (
            <div key={d.id} className="flex items-center gap-2 p-2.5 bg-slate-900/50 border border-slate-800 rounded-md">
              <input className={inputCls} value={d.name} onChange={(e) => update(d.id, { name: e.target.value })} />
              <input className={inputCls + " max-w-[140px]"} placeholder="Owner" value={d.owner} onChange={(e) => update(d.id, { owner: e.target.value })} />
              <input type="date" className={inputCls + " max-w-[150px]"} value={d.dueDate} onChange={(e) => update(d.id, { dueDate: e.target.value })} />
              <select className={inputCls + " max-w-[120px]"} value={d.status} onChange={(e) => update(d.id, { status: e.target.value })}>{["Pending", "Received", "Blocked"].map((s) => <option key={s}>{s}</option>)}</select>
              <label className="flex items-center gap-1 text-xs text-slate-400 shrink-0"><input type="checkbox" checked={d.isBlocking} onChange={(e) => update(d.id, { isBlocking: e.target.checked })} /> Blocking</label>
              <button onClick={() => remove(d.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5 border border-dashed border-slate-700 rounded-md">
        <input className={inputCls} placeholder="New dependency (e.g. customer API credentials)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={inputCls + " max-w-[140px]"} placeholder="Owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
        <input type="date" className={inputCls + " max-w-[150px]"} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        <button onClick={add} className="text-teal-400 hover:text-teal-300 shrink-0"><Plus size={16} /></button>
      </div>
    </div>
  );
}

/* ---------- Risks (scoped to this project) ---------- */
function RisksTab({ project, risks, setRisks }) {
  const [form, setForm] = useState({ description: "", likelihood: "Medium", impact: "Medium", mitigation: "", escalationTrigger: "", status: "Open" });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const add = async () => {
    if (!form.description.trim()) return;
    try { const created = await risksTable.create({ ...form, projectId: project.id, source: "manual" }); setRisks([...risks, created]); setForm({ description: "", likelihood: "Medium", impact: "Medium", mitigation: "", escalationTrigger: "", status: "Open" }); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const remove = async (id) => { try { await risksTable.remove(id); setRisks(risks.filter((r) => r.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };
  const toggleMaterialized = async (r) => {
    try { const updated = await risksTable.update(r.id, { ...r, materialized: !r.materialized }); setRisks(risks.map((x) => (x.id === r.id ? updated : x))); }
    catch (e) { alert("Update failed: " + e.message); }
  };

  const runAISuggest = async () => {
    setSuggesting(true); setSuggestions(null);
    try {
      const result = await callClaude(
        `You are a CX/professional-services delivery risk analyst for a B2B SaaS implementation. Given this project context:
Name: ${project.name}, Account: ${project.account}, Vertical: ${project.vertical}, Stage: ${project.stage}, Notes: ${project.notes || "none"}.
Generate 4-6 realistic implementation risks. Return ONLY raw JSON, an array, no markdown fences:
[{"description":"","likelihood":"Low|Medium|High","impact":"Low|Medium|High","mitigation":"","escalationTrigger":""}]`
      );
      setSuggestions(Array.isArray(result) ? result : []);
    } catch (e) { alert("AI risk suggestion failed: " + e.message); }
    finally { setSuggesting(false); }
  };
  const acceptSuggestion = async (s) => {
    try { const created = await risksTable.create({ ...s, projectId: project.id, status: "Open", source: "ai" }); setRisks([...risks, created]); setSuggestions(suggestions.filter((x) => x !== s)); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const acceptAll = async () => {
    try { const created = await Promise.all(suggestions.map((s) => risksTable.create({ ...s, projectId: project.id, status: "Open", source: "ai" }))); setRisks([...risks, ...created]); setSuggestions([]); }
    catch (e) { alert("Save failed: " + e.message); }
  };

  return (
    <div>
      <div className="mb-4"><AIButton onClick={runAISuggest} busy={suggesting} label="Generate risk flags" /></div>
      {suggestions?.length > 0 && (
        <div className="mb-4 space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-md">
              <div className="flex items-start justify-between gap-3"><p className="text-sm text-slate-200">{s.description}</p><button onClick={() => acceptSuggestion(s)} className="text-xs text-teal-400 hover:text-teal-300 whitespace-nowrap">Add ↵</button></div>
              <div className="flex gap-3 mt-1.5 text-xs font-mono"><span className={`px-1.5 py-0.5 rounded border ${LEVEL_COLOR[s.likelihood]}`}>L: {s.likelihood}</span><span className={`px-1.5 py-0.5 rounded border ${LEVEL_COLOR[s.impact]}`}>I: {s.impact}</span></div>
              <p className="text-xs text-slate-400 mt-1.5"><span className="text-slate-500">Mitigation:</span> {s.mitigation}</p>
            </div>
          ))}
          <button onClick={acceptAll} className="text-xs text-teal-400 hover:text-teal-300">Add all {suggestions.length}</button>
        </div>
      )}
      {risks.length === 0 ? <EmptyState text="No risks logged." /> : (
        <div className="space-y-2 mb-4">
          {risks.map((r) => (
            <div key={r.id} className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {r.source === "ai" && <span className="text-[10px] text-teal-400 border border-teal-500/30 rounded px-1">AI</span>}
                    <span className={`text-[10px] px-1.5 rounded border ${r.status === "Open" ? "text-amber-400 border-amber-500/40" : "text-slate-500 border-slate-700"}`}>{r.status}</span>
                    {r.materialized && <span className="text-[10px] px-1.5 rounded border text-rose-400 border-rose-500/40">Materialized</span>}
                  </div>
                  <p className="text-sm text-slate-100">{r.description}</p>
                </div>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
              </div>
              <div className="flex gap-3 mt-2 text-xs font-mono">
                <span className={`px-1.5 py-0.5 rounded border ${LEVEL_COLOR[r.likelihood]}`}>L: {r.likelihood}</span>
                <span className={`px-1.5 py-0.5 rounded border ${LEVEL_COLOR[r.impact]}`}>I: {r.impact}</span>
                <button onClick={() => toggleMaterialized(r)} className="text-slate-500 hover:text-slate-300 ml-auto">{r.materialized ? "Mark as didn't happen" : "Mark as materialized"}</button>
              </div>
              {r.mitigation && <p className="text-xs text-slate-400 mt-1.5"><span className="text-slate-500">Mitigation:</span> {r.mitigation}</p>}
              {r.escalationTrigger && <p className="text-xs text-slate-400 mt-1"><span className="text-slate-500">Escalate if:</span> {r.escalationTrigger}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="p-3 border border-dashed border-slate-700 rounded-md">
        <textarea className={inputCls + " mb-2"} rows={2} placeholder="Describe a risk..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select className={inputCls} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: e.target.value })}>{["Low", "Medium", "High"].map((s) => <option key={s}>{s}</option>)}</select>
          <select className={inputCls} value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })}>{["Low", "Medium", "High"].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <input className={inputCls + " mb-2"} placeholder="Mitigation" value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} />
        <button onClick={add} className="text-xs text-teal-400 hover:text-teal-300">+ Log risk</button>
      </div>
    </div>
  );
}

/* ---------- Scope & Changes ---------- */
function ScopeChangesTab({ projectId, scopeItems, setScopeItems, changeRequests, setChangeRequests }) {
  const [scopeForm, setScopeForm] = useState({ name: "", description: "", status: "In scope" });
  const [crForm, setCrForm] = useState({ description: "", impactHours: "", impactWeeks: "", status: "Proposed" });

  const addScope = async () => {
    if (!scopeForm.name.trim()) return;
    try { const created = await scopeItemsTable.create({ ...scopeForm, projectId }); setScopeItems([...scopeItems, created]); setScopeForm({ name: "", description: "", status: "In scope" }); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const removeScope = async (id) => { try { await scopeItemsTable.remove(id); setScopeItems(scopeItems.filter((s) => s.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  const addCr = async () => {
    if (!crForm.description.trim()) return;
    try { const created = await changeRequestsTable.create({ ...crForm, projectId }); setChangeRequests([...changeRequests, created]); setCrForm({ description: "", impactHours: "", impactWeeks: "", status: "Proposed" }); }
    catch (e) { alert("Save failed: " + e.message); }
  };
  const removeCr = async (id) => { try { await changeRequestsTable.remove(id); setChangeRequests(changeRequests.filter((c) => c.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };
  const updateCrStatus = async (c, status) => { try { const updated = await changeRequestsTable.update(c.id, { ...c, status }); setChangeRequests(changeRequests.map((x) => (x.id === c.id ? updated : x))); } catch (e) { alert("Update failed: " + e.message); } };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs uppercase tracking-wide text-slate-400 font-mono mb-2">Scope items</h4>
        {scopeItems.length === 0 ? <EmptyState text="No scope items defined." /> : (
          <div className="space-y-2 mb-3">
            {scopeItems.map((s) => (
              <div key={s.id} className="p-2.5 bg-slate-900/50 border border-slate-800 rounded-md flex items-start justify-between gap-2">
                <div><p className="text-sm text-slate-100">{s.name}</p>{s.description && <p className="text-xs text-slate-500">{s.description}</p>}<span className="text-[10px] text-slate-500 font-mono">{s.status}</span></div>
                <button onClick={() => removeScope(s.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="p-2.5 border border-dashed border-slate-700 rounded-md">
          <input className={inputCls + " mb-2"} placeholder="Scope item" value={scopeForm.name} onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })} />
          <button onClick={addScope} className="text-xs text-teal-400 hover:text-teal-300">+ Add</button>
        </div>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-slate-400 font-mono mb-2">Change requests</h4>
        {changeRequests.length === 0 ? <EmptyState text="No change requests logged." /> : (
          <div className="space-y-2 mb-3">
            {changeRequests.map((c) => (
              <div key={c.id} className="p-2.5 bg-slate-900/50 border border-slate-800 rounded-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-100">{c.description}</p>
                  <button onClick={() => removeCr(c.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-500 font-mono">{c.impactHours || 0}hr / {c.impactWeeks || 0}wk</span>
                  <select className="text-xs bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300" value={c.status} onChange={(e) => updateCrStatus(c, e.target.value)}>{["Proposed", "Approved", "Rejected"].map((s) => <option key={s}>{s}</option>)}</select>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="p-2.5 border border-dashed border-slate-700 rounded-md">
          <textarea className={inputCls + " mb-2"} rows={2} placeholder="Change request description" value={crForm.description} onChange={(e) => setCrForm({ ...crForm, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input className={inputCls} type="number" placeholder="Impact hours" value={crForm.impactHours} onChange={(e) => setCrForm({ ...crForm, impactHours: e.target.value })} />
            <input className={inputCls} type="number" placeholder="Impact weeks" value={crForm.impactWeeks} onChange={(e) => setCrForm({ ...crForm, impactWeeks: e.target.value })} />
          </div>
          <button onClick={addCr} className="text-xs text-teal-400 hover:text-teal-300">+ Add</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Closeout ---------- */
function CloseoutTab({ project, milestones, risks, changeRequests, closeout, setCloseout, onUpdated }) {
  // Derive what we can; only ask for what genuinely requires human judgment.
  const derivedScheduleVarianceDays = useMemo(() => {
    if (!project.startDate || !project.targetDate) return null;
    const planned = (new Date(project.targetDate) - new Date(project.startDate)) / (1000 * 60 * 60 * 24);
    const today = (new Date() - new Date(project.startDate)) / (1000 * 60 * 60 * 24);
    return Math.round(today - planned);
  }, [project]);
  const derivedScopeSummary = useMemo(
    () => changeRequests.filter((c) => c.status === "Approved").map((c) => `${c.description} (+${c.impactWeeks || 0}wk)`).join("; ") || "No approved change requests.",
    [changeRequests]
  );
  const derivedRisksMaterialized = useMemo(
    () => risks.filter((r) => r.materialized).map((r) => r.description).join("; ") || "No risks marked as materialized.",
    [risks]
  );

  const [form, setForm] = useState(closeout || {
    projectId: project.id, actualDurationWeeks: "", actualHours: "",
    scheduleVarianceDays: derivedScheduleVarianceDays, varianceDrivers: "",
    scopeChangesSummary: derivedScopeSummary, risksMaterializedSummary: derivedRisksMaterialized, lessonsLearned: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await closeoutsTable.upsert({ ...form, projectId: project.id, scheduleVarianceDays: derivedScheduleVarianceDays });
      setCloseout(saved);
      const updatedProject = await projectsTable.update(project.id, { ...project, stage: "Closed" });
      onUpdated(updatedProject);
      alert("Closeout saved. Project marked Closed.");
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl">
      <p className="text-xs text-slate-500 mb-4">Two minutes, not a retrospective. What's derivable is pre-filled below — confirm or correct it, and add the two things that only you know.</p>

      <Field label="Actual duration (weeks)"><input type="number" className={inputCls} value={form.actualDurationWeeks || ""} onChange={(e) => setForm({ ...form, actualDurationWeeks: e.target.value })} /></Field>
      <Field label="Actual effort (hours)"><input type="number" className={inputCls} value={form.actualHours || ""} onChange={(e) => setForm({ ...form, actualHours: e.target.value })} /></Field>

      <Field label="Schedule variance (derived from start/target dates, in days)">
        <div className="text-sm text-slate-400 font-mono px-3 py-2 bg-slate-950 border border-slate-800 rounded-md">{derivedScheduleVarianceDays === null ? "Not enough date data to derive" : derivedScheduleVarianceDays}</div>
      </Field>

      <Field label="Scope changes summary (derived from change requests — edit if needed)">
        <textarea className={inputCls} rows={2} value={form.scopeChangesSummary} onChange={(e) => setForm({ ...form, scopeChangesSummary: e.target.value })} />
      </Field>
      <Field label="Risks that materialized (derived from risk log — edit if needed)">
        <textarea className={inputCls} rows={2} value={form.risksMaterializedSummary} onChange={(e) => setForm({ ...form, risksMaterializedSummary: e.target.value })} />
      </Field>

      <Field label="Variance drivers — why did actuals differ from plan? (only you know this)">
        <textarea className={inputCls} rows={3} value={form.varianceDrivers} onChange={(e) => setForm({ ...form, varianceDrivers: e.target.value })} placeholder="e.g. customer-side data migration took 3 extra weeks due to legacy ERP export format" />
      </Field>
      <Field label="Lessons learned (only you know this)">
        <textarea className={inputCls} rows={3} value={form.lessonsLearned} onChange={(e) => setForm({ ...form, lessonsLearned: e.target.value })} />
      </Field>

      <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">
        <CheckCircle2 size={14} /> {saving ? "Saving..." : closeout ? "Update closeout" : "Save closeout & close project"}
      </button>
    </div>
  );
}
