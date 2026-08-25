import React, { useState, useEffect } from "react";
import { Plus, Trash2, Rocket } from "lucide-react";
import { Field, Modal, AIButton, EmptyState, inputCls, uid } from "./ui";
import { blueprintsTable, blueprintPhasesTable, projectsTable, milestonesTable } from "../lib/storage";
import { callClaude } from "../lib/ai";

export default function Blueprints({ onProjectCreated }) {
  const [blueprints, setBlueprints] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [phases, setPhases] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [useModalOpen, setUseModalOpen] = useState(false);
  const [useForm, setUseForm] = useState({ name: "", account: "", vertical: "", owner: "", startDate: "" });

  useEffect(() => { blueprintsTable.list().then(setBlueprints); }, []);
  useEffect(() => { if (activeId) blueprintPhasesTable.list({ blueprint_id: activeId }).then((p) => setPhases(p.sort((a, b) => a.orderIndex - b.orderIndex))); else setPhases([]); }, [activeId]);

  const active = blueprints.find((b) => b.id === activeId);

  const createBlueprint = async () => {
    if (!newName.trim()) return;
    try {
      const created = await blueprintsTable.create({ name: newName, description: newDesc, source: "manual" });
      setBlueprints([...blueprints, created]);
      setActiveId(created.id);
      setModalOpen(false); setNewName(""); setNewDesc("");
    } catch (e) { alert("Create failed: " + e.message); }
  };

  const removeBlueprint = async (id) => {
    if (!confirm("Delete this blueprint and its phases?")) return;
    try { await blueprintsTable.remove(id); setBlueprints(blueprints.filter((b) => b.id !== id)); if (activeId === id) setActiveId(null); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const addPhase = async () => {
    try {
      const created = await blueprintPhasesTable.create({ blueprintId: activeId, orderIndex: phases.length, name: "New phase", defaultOwnerRole: "", defaultDurationWeeks: 2, defaultRiskFlags: [], exitCriteria: "", defaultMilestones: [] });
      setPhases([...phases, created]);
    } catch (e) { alert("Create failed: " + e.message); }
  };
  const updatePhase = async (id, patch) => {
    try { const updated = await blueprintPhasesTable.update(id, { ...phases.find((p) => p.id === id), ...patch }); setPhases(phases.map((p) => (p.id === id ? updated : p))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const removePhase = async (id) => { try { await blueprintPhasesTable.remove(id); setPhases(phases.filter((p) => p.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  const addMilestoneToPhase = (phaseId) => {
    const phase = phases.find((p) => p.id === phaseId);
    updatePhase(phaseId, { defaultMilestones: [...(phase.defaultMilestones || []), { name: "", weekOffset: 1 }] });
  };
  const updateMilestoneOnPhase = (phaseId, idx, patch) => {
    const phase = phases.find((p) => p.id === phaseId);
    const ms = [...phase.defaultMilestones]; ms[idx] = { ...ms[idx], ...patch };
    updatePhase(phaseId, { defaultMilestones: ms });
  };
  const removeMilestoneOnPhase = (phaseId, idx) => {
    const phase = phases.find((p) => p.id === phaseId);
    updatePhase(phaseId, { defaultMilestones: phase.defaultMilestones.filter((_, i) => i !== idx) });
  };

  const suggestPhases = async () => {
    setSuggesting(true);
    try {
      const result = await callClaude(
        `Design a standard B2B SaaS implementation phase blueprint for: ${active.name}. ${active.description ? "Context: " + active.description : ""}
Return ONLY raw JSON, an array, no markdown fences:
[{"name":"","defaultOwnerRole":"role, not a person","defaultDurationWeeks":0,"exitCriteria":"","defaultMilestones":[{"name":"","weekOffset":0}]}]
5-7 phases, Discovery through Hypercare. weekOffset is weeks from project start.`
      );
      const created = [];
      for (let i = 0; i < result.length; i++) {
        const p = result[i];
        created.push(await blueprintPhasesTable.create({ blueprintId: activeId, orderIndex: i, name: p.name, defaultOwnerRole: p.defaultOwnerRole, defaultDurationWeeks: p.defaultDurationWeeks, exitCriteria: p.exitCriteria, defaultRiskFlags: [], defaultMilestones: p.defaultMilestones || [] }));
      }
      setPhases(created);
    } catch (e) { alert("AI suggestion failed: " + e.message); }
    finally { setSuggesting(false); }
  };

  const useBlueprint = async () => {
    if (!useForm.name.trim() || !useForm.startDate) { alert("Project name and start date are required to compute milestone dates."); return; }
    try {
      const project = await projectsTable.create({ ...useForm, health: "Green", stage: "Discovery", blueprintId: activeId });
      const startDate = new Date(useForm.startDate);
      for (const phase of phases) {
        for (const m of phase.defaultMilestones || []) {
          const due = new Date(startDate);
          due.setDate(due.getDate() + (Number(m.weekOffset) || 0) * 7);
          await milestonesTable.create({ projectId: project.id, name: `${phase.name}: ${m.name}`, dueDate: due.toISOString().slice(0, 10), status: "Pending", isCritical: false, owner: phase.defaultOwnerRole });
        }
      }
      setUseModalOpen(false);
      onProjectCreated(project.id);
    } catch (e) { alert("Failed to create project: " + e.message); }
  };

  return (
    <div className="flex gap-5">
      <div className="w-56 shrink-0">
        <button onClick={() => setModalOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 mb-3"><Plus size={14} /> New blueprint</button>
        <div className="space-y-1">
          {blueprints.map((b) => (
            <button key={b.id} onClick={() => setActiveId(b.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm truncate ${activeId === b.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-900"}`}>{b.name}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {!active ? <EmptyState text="Select or create a blueprint. A blueprint is a reusable phase template — start a new project from it and it generates the initial milestone plan for you." /> : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">{active.name}</h3>
                {active.description && <p className="text-xs text-slate-500">{active.description}</p>}
              </div>
              <div className="flex gap-2">
                <AIButton onClick={suggestPhases} busy={suggesting} label="Suggest phases" />
                <button onClick={() => setUseModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400"><Rocket size={14} /> Start project from this</button>
                <button onClick={() => removeBlueprint(active.id)} className="text-xs text-rose-400 hover:text-rose-300">Delete</button>
              </div>
            </div>
            <div className="space-y-3">
              {phases.map((p, i) => (
                <div key={p.id} className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-slate-500 w-5">{i + 1}.</span>
                    <input className={inputCls} value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} />
                    <button onClick={() => removePhase(p.id)} className="text-slate-500 hover:text-rose-400 shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <input className={inputCls} placeholder="Owner role" value={p.defaultOwnerRole} onChange={(e) => updatePhase(p.id, { defaultOwnerRole: e.target.value })} />
                    <input className={inputCls} type="number" placeholder="Duration (weeks)" value={p.defaultDurationWeeks || ""} onChange={(e) => updatePhase(p.id, { defaultDurationWeeks: e.target.value })} />
                  </div>
                  <input className={inputCls + " mb-2"} placeholder="Exit criteria" value={p.exitCriteria} onChange={(e) => updatePhase(p.id, { exitCriteria: e.target.value })} />
                  <div className="pl-2 border-l-2 border-slate-800">
                    {(p.defaultMilestones || []).map((m, idx) => (
                      <div key={idx} className="flex gap-2 mb-1.5 items-center">
                        <input className={inputCls} placeholder="Milestone name" value={m.name} onChange={(e) => updateMilestoneOnPhase(p.id, idx, { name: e.target.value })} />
                        <input className={inputCls + " max-w-[140px]"} type="number" placeholder="Week offset" value={m.weekOffset} onChange={(e) => updateMilestoneOnPhase(p.id, idx, { weekOffset: e.target.value })} />
                        <button onClick={() => removeMilestoneOnPhase(p.id, idx)} className="text-slate-500 hover:text-rose-400"><Trash2 size={13} /></button>
                      </div>
                    ))}
                    <button onClick={() => addMilestoneToPhase(p.id)} className="text-xs text-teal-400 hover:text-teal-300">+ Milestone</button>
                  </div>
                </div>
              ))}
              <button onClick={addPhase} className="w-full py-2 rounded-md border border-dashed border-slate-700 text-xs text-slate-400 hover:border-teal-500/50 hover:text-teal-400">+ Add phase</button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal title="New blueprint" onClose={() => setModalOpen(false)}>
          <Field label="Name"><input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} /></Field>
          <Field label="Description"><textarea className={inputCls} rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></Field>
          <button onClick={createBlueprint} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400">Create</button>
        </Modal>
      )}

      {useModalOpen && (
        <Modal title={`Start project from "${active?.name}"`} onClose={() => setUseModalOpen(false)}>
          <Field label="Project name"><input className={inputCls} value={useForm.name} onChange={(e) => setUseForm({ ...useForm, name: e.target.value })} /></Field>
          <Field label="Account"><input className={inputCls} value={useForm.account} onChange={(e) => setUseForm({ ...useForm, account: e.target.value })} /></Field>
          <Field label="Vertical"><input className={inputCls} value={useForm.vertical} onChange={(e) => setUseForm({ ...useForm, vertical: e.target.value })} /></Field>
          <Field label="Owner"><input className={inputCls} value={useForm.owner} onChange={(e) => setUseForm({ ...useForm, owner: e.target.value })} /></Field>
          <Field label="Start date (milestone dates are computed from this)"><input type="date" className={inputCls} value={useForm.startDate} onChange={(e) => setUseForm({ ...useForm, startDate: e.target.value })} /></Field>
          <button onClick={useBlueprint} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 inline-flex items-center gap-1.5"><Rocket size={14} /> Create project</button>
        </Modal>
      )}
    </div>
  );
}
