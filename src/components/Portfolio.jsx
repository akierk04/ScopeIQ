import React, { useState } from "react";
import { Plus, ClipboardPaste } from "lucide-react";
import { Badge, Field, Modal, AIButton, EmptyState, inputCls } from "./ui";
import { projectsTable } from "../lib/storage";
import { callClaude } from "../lib/ai";

export default function Portfolio({ projects, setProjects, onOpenProject }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { name: "", account: "", vertical: "", owner: "", health: "Green", stage: "Discovery", startDate: "", targetDate: "", notes: "" };
  const [form, setForm] = useState(blank);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const created = await projectsTable.create(form);
      setProjects([...projects, created]);
      setModalOpen(false);
      setForm(blank);
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const parsePaste = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const result = await callClaude(
        `Extract structured project/implementation info from this pasted text. Return ONLY raw JSON, no markdown fences, matching exactly:
{"name":"","account":"","vertical":"","owner":"","stage":"","startDate":"","targetDate":"","notes":""}
If a field isn't present, use an empty string. Text:
---
${pasteText}
---`
      );
      setForm({ ...blank, ...result, health: "Green" });
      setShowPaste(false);
      setPasteText("");
    } catch (e) { alert("Couldn't parse that text: " + e.message); }
    finally { setParsing(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-slate-400 font-mono">{projects.length} active implementation{projects.length === 1 ? "" : "s"}</div>
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400"><Plus size={14} /> New project</button>
      </div>
      {projects.length === 0 ? <EmptyState text="No projects tracked yet. Add one manually, paste in scope notes, or start one from a Blueprint." /> : (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase font-mono">
              <tr><th className="text-left px-4 py-2">Project</th><th className="text-left px-4 py-2">Account</th><th className="text-left px-4 py-2">Owner</th><th className="text-left px-4 py-2">Stage</th><th className="text-left px-4 py-2">Health</th><th className="text-left px-4 py-2">Target</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} onClick={() => onOpenProject(p.id)} className="border-t border-slate-800 hover:bg-slate-900/50 cursor-pointer">
                  <td className="px-4 py-2.5 font-medium text-slate-100">{p.name}</td>
                  <td className="px-4 py-2.5 text-slate-300">{p.account}</td>
                  <td className="px-4 py-2.5 text-slate-300">{p.owner}</td>
                  <td className="px-4 py-2.5 text-slate-300">{p.stage}</td>
                  <td className="px-4 py-2.5"><Badge health={p.health} /></td>
                  <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{p.targetDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modalOpen && (
        <Modal title="New project" onClose={() => setModalOpen(false)} wide>
          <button onClick={() => setShowPaste(!showPaste)} className="mb-3 inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200"><ClipboardPaste size={14} /> {showPaste ? "Hide paste import" : "Paste from document instead"}</button>
          {showPaste && (
            <div className="mb-4 p-3 bg-slate-950 border border-slate-800 rounded-md">
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} placeholder="Paste scoping notes, kickoff email, SOW excerpt..." className={inputCls + " mb-2"} />
              <AIButton onClick={parsePaste} busy={parsing} label="Extract fields" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Project name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Account"><input className={inputCls} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} /></Field>
            <Field label="Vertical"><input className={inputCls} value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })} /></Field>
            <Field label="Owner"><input className={inputCls} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
            <Field label="Stage"><select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{["Discovery", "Scoping", "Build", "UAT", "Go-live", "Hypercare", "Closed"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Health"><select className={inputCls} value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value })}>{["Green", "Amber", "Red"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Start date"><input type="date" className={inputCls} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="Target date"><input type="date" className={inputCls} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setModalOpen(false)} className="px-3 py-1.5 rounded-md text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Cancel</button>
            <button onClick={create} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">{saving ? "Saving..." : "Create project"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
