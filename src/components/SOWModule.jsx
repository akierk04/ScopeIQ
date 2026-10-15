import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download, Trash2, Plus, X, Rocket, Upload, Loader2 } from "lucide-react";
import { Field, AIButton, Modal, inputCls, download } from "./ui";
import { sowsTable, projectsTable } from "../lib/storage";
import { callClaude } from "../lib/ai";
import { extractFile } from "../lib/fileExtract";

const STATUS_COLOR = {
  Draft: "text-slate-400 border-slate-600",
  Approved: "text-emerald-400 border-emerald-500/40",
  Rejected: "text-rose-400 border-rose-500/40",
};

const OUT_OF_SCOPE_DEFAULTS = [
  "Requirements in any RFP, online vendor portal terms, or similar document not expressly set forth in this SOW.",
  "Functionality described in sales demos or promotional material not expressly set forth in this SOW.",
  "Additions or changes to the scope parameters described above (requires a Change Order).",
  "Additional products or modules other than those expressly agreed in this SOW.",
];

function lineTotal(line, roles) {
  const role = roles.find((r) => r.name === line.role);
  const rate = role?.hourlyRate || 0;
  return (Number(line.hours) || 0) * rate;
}

export default function SOWModule({ projects, sows, setSows, roles, settings, onProjectCreated }) {
  const [form, setForm] = useState({ projectId: "", vertical: "", useCaseType: "", complexity: "Medium", mode: "T&M", pasteContext: "" });
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [projectModalSow, setProjectModalSow] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same filename later
    if (!file) return;
    setExtracting(true);
    setExtractNote("");
    try {
      const { text, truncated, sourceType } = await extractFile(file);
      setForm((f) => ({ ...f, pasteContext: f.pasteContext ? `${f.pasteContext}\n\n--- ${file.name} ---\n${text}` : text }));
      setExtractNote(`Added "${file.name}" (${sourceType})${truncated ? " — truncated, it was long" : ""}.`);
    } catch (err) {
      alert("Couldn't read that file: " + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const vendor = settings.vendor_name || "Vendor";
  const product = settings.product_name || "Product";

  const generate = async () => {
    if (!form.vertical.trim() || !form.useCaseType.trim()) { alert("Vertical and use case type are required."); return; }
    if (roles.length === 0) { alert("Add at least one role to the Rate Card first — the SOW needs roles to assign hours to."); return; }
    setGenerating(true); setDraft(null);
    try {
      const result = await callClaude(
        `You are drafting a Statement of Work for ${vendor}, a B2B SaaS implementation vendor (product: ${product}), for a customer implementation.
Vertical: ${form.vertical}
Use case type: ${form.useCaseType}
Complexity: ${form.complexity}
Available resource roles: ${roles.map((r) => r.name).join(", ")}
Additional context: ${form.pasteContext || "none"}

Return ONLY raw JSON, no markdown fences:
{
  "objectives": ["1-3 short objective statements"],
  "termWeeks": 0,
  "inScope": ["bullet list of specific in-scope activities, following a real SOW's level of specificity"],
  "outOfScope": ["3-5 scope exclusions, specific to this engagement, beyond generic boilerplate"],
  "assumptions": ["4-8 concrete assumptions this estimate depends on, e.g. data readiness, no custom integrations, etc."],
  "customerResponsibilities": ["3-6 things the customer must provide or do"],
  "resourceLines": [{"role":"<one of the available roles above, exactly>","hours":0}],
  "narrative": "2-3 sentence scope summary in professional-services language"
}
Base the resource line hours on realistic effort for the complexity level. Do not invent roles not in the available list. Do not include dollar amounts anywhere — those are calculated separately.`
      );
      setDraft(result);
    } catch (e) { alert("SOW generation failed: " + e.message); }
    finally { setGenerating(false); }
  };

  const totalCost = (d) => (d?.resourceLines || []).reduce((sum, l) => sum + lineTotal(l, roles), 0);
  const totalHours = (d) => (d?.resourceLines || []).reduce((sum, l) => sum + (Number(l.hours) || 0), 0);

  const updateDraftLine = (idx, patch) => {
    const lines = [...draft.resourceLines];
    lines[idx] = { ...lines[idx], ...patch };
    setDraft({ ...draft, resourceLines: lines });
  };
  const addDraftLine = () => setDraft({ ...draft, resourceLines: [...draft.resourceLines, { role: roles[0]?.name || "", hours: 0 }] });
  const removeDraftLine = (idx) => setDraft({ ...draft, resourceLines: draft.resourceLines.filter((_, i) => i !== idx) });

  const saveDraft = async () => {
    if (!draft) return;
    try {
      const created = await sowsTable.create({
        projectId: form.projectId, vertical: form.vertical, useCaseType: form.useCaseType, complexity: form.complexity,
        mode: form.mode, totalHours: totalHours(draft), totalWeeks: draft.termWeeks,
        phases: draft.resourceLines, assumptions: draft.assumptions, narrative: draft.narrative,
        objectives: draft.objectives, inScope: draft.inScope, outOfScope: draft.outOfScope,
        customerResponsibilities: draft.customerResponsibilities, status: "Draft",
      });
      setSows([...sows, created]);
      setDraft(null);
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const setStatus = async (sow, status) => {
    try {
      const updated = await sowsTable.update(sow.id, { ...sow, status });
      setSows(sows.map((s) => (s.id === sow.id ? updated : s)));
    } catch (e) { alert("Status update failed: " + e.message); }
  };

  const exportSow = (s) => {
    const cost = (s.phases || []).reduce((sum, l) => sum + lineTotal(l, roles), 0);
    const md = `# Statement of Work

**${vendor}** (${product}) — ${s.vertical} / ${s.useCaseType}

**Complexity:** ${s.complexity} · **Mode:** ${s.mode || "T&M"} · **Estimated term:** ${s.totalWeeks} weeks

## Objectives
${(s.objectives || []).map((o) => `- ${o}`).join("\n") || "—"}

## Scope summary
${s.narrative}

## In scope
${(s.inScope || []).map((i) => `- ${i}`).join("\n") || "—"}

## Out of scope
${(s.outOfScope || OUT_OF_SCOPE_DEFAULTS).map((i) => `- ${i}`).join("\n")}

## Assumptions
${(s.assumptions || []).map((a) => `- ${a}`).join("\n") || "—"}

## Customer responsibilities
${(s.customerResponsibilities || []).map((c) => `- ${c}`).join("\n") || "—"}

## Resourcing and fees
${(s.phases || []).map((l) => `- **${l.role}** — ${l.hours} hrs`).join("\n")}

**Total: ${(s.phases || []).reduce((sum, l) => sum + (Number(l.hours) || 0), 0)} hours, $${cost.toLocaleString()} estimated (${s.mode || "T&M"})**
`;
    download(`SOW_${s.vertical}_${s.useCaseType}.md`.replace(/\s+/g, "_"), md);
  };
  const removeSow = async (id) => { try { await sowsTable.remove(id); setSows(sows.filter((s) => s.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  return (
    <div>
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg mb-5">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Link to project (optional)"><select className={inputCls} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Complexity"><select className={inputCls} value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })}>{["Low", "Medium", "High", "Enterprise"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Vertical"><input className={inputCls} placeholder="e.g. Industrial manufacturing" value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })} /></Field>
          <Field label="Use case type"><input className={inputCls} placeholder="e.g. Price optimization rollout" value={form.useCaseType} onChange={(e) => setForm({ ...form, useCaseType: e.target.value })} /></Field>
          <Field label="Fee mode"><select className={inputCls} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="T&M">Time &amp; Materials</option><option value="Fixed Fee">Fixed Fee</option></select></Field>
        </div>
        <Field label="Paste scope notes / prior SOW excerpt (optional context)">
          <textarea className={inputCls} rows={3} value={form.pasteContext} onChange={(e) => setForm({ ...form, pasteContext: e.target.value })} />
        </Field>
        <div className="flex items-center gap-3 mb-4 -mt-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 cursor-pointer border border-teal-500/30 rounded-md px-3 py-1.5 bg-teal-500/10">
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {extracting ? "Reading..." : "Upload discovery doc (PDF, DOCX, XLSX, image)"}
            <input type="file" accept=".pdf,.docx,.xlsx,image/*" className="hidden" disabled={extracting} onChange={handleFileUpload} />
          </label>
          {extractNote && <span className="text-xs text-slate-500">{extractNote}</span>}
        </div>
        <AIButton onClick={generate} busy={generating} label="Generate SOW draft" />
      </div>

      {draft && (
        <div className="mb-6 p-4 border border-teal-500/30 bg-teal-500/5 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-100">Draft — {totalHours(draft)} hrs / ${totalCost(draft).toLocaleString()} ({form.mode})</h4>
            <button onClick={saveDraft} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Save to log</button>
          </div>
          <p className="text-sm text-slate-300 mb-3">{draft.narrative}</p>

          <SectionList title="Objectives" items={draft.objectives} />
          <SectionList title="In scope" items={draft.inScope} />
          <SectionList title="Out of scope" items={draft.outOfScope} />
          <SectionList title="Assumptions" items={draft.assumptions} />
          <SectionList title="Customer responsibilities" items={draft.customerResponsibilities} />

          <div className="mt-3">
            <span className="text-xs uppercase tracking-wide text-slate-400 font-mono">Resourcing</span>
            <div className="mt-1.5 space-y-1.5">
              {draft.resourceLines.map((l, i) => {
                const role = roles.find((r) => r.name === l.role);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <select className={inputCls} value={l.role} onChange={(e) => updateDraftLine(i, { role: e.target.value })}>
                      {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                    <input className={inputCls + " max-w-[90px]"} type="number" value={l.hours} onChange={(e) => updateDraftLine(i, { hours: e.target.value })} />
                    <span className="text-slate-500 font-mono w-24 shrink-0">${role?.hourlyRate || 0}/hr</span>
                    <span className="text-slate-300 font-mono w-24 shrink-0">${lineTotal(l, roles).toLocaleString()}</span>
                    <button onClick={() => removeDraftLine(i)} className="text-slate-500 hover:text-rose-400"><X size={13} /></button>
                  </div>
                );
              })}
              <button onClick={addDraftLine} className="text-xs text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"><Plus size={12} /> Add line</button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 font-mono mb-2">{sows.length} saved estimate{sows.length === 1 ? "" : "s"}</div>
      <div className="space-y-2">
        {sows.map((s) => {
          const cost = (s.phases || []).reduce((sum, l) => sum + lineTotal(l, roles), 0);
          return (
            <div key={s.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
              <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-100 font-medium">{s.vertical} — {s.useCaseType}</span>
                  <span className="text-xs text-slate-500 font-mono">${cost.toLocaleString()} / {s.complexity}</span>
                  <span className={`text-[10px] px-1.5 rounded border ${STATUS_COLOR[s.status] || STATUS_COLOR.Draft}`}>{s.status || "Draft"}</span>
                  {s.linkedProjectId && <span className="text-[10px] px-1.5 rounded border text-teal-400 border-teal-500/40">Project started</span>}
                </div>
                {expanded === s.id ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
              </button>
              {expanded === s.id && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-slate-300 mb-2">{s.narrative}</p>
                  {(s.phases || []).map((l, i) => (<div key={i} className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-1.5"><span className="text-slate-200">{l.role}</span><span>{l.hours}hr</span></div>))}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-slate-500">Status:</span>
                    <select className={inputCls + " max-w-[140px]"} value={s.status || "Draft"} onChange={(e) => setStatus(s, e.target.value)}>
                      {["Draft", "Approved", "Rejected"].map((st) => <option key={st}>{st}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3 mt-3 items-center flex-wrap">
                    <button onClick={() => exportSow(s)} className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"><Download size={13} /> Export .md</button>
                    <button onClick={() => removeSow(s.id)} className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"><Trash2 size={13} /> Delete</button>
                    {s.status === "Approved" ? (
                      <button onClick={() => setProjectModalSow(s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 ml-auto"><Rocket size={13} /> Create project from this SOW</button>
                    ) : (
                      <span className="text-xs text-slate-600 ml-auto">Approve this SOW to create a project from it</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projectModalSow && (
        <CreateProjectFromSow sow={projectModalSow} onClose={() => setProjectModalSow(null)}
          onCreated={(project) => { onProjectCreated && onProjectCreated(project.id); setProjectModalSow(null); }} />
      )}
    </div>
  );
}

function CreateProjectFromSow({ sow, onClose, onCreated }) {
  const [form, setForm] = useState({ name: `${sow.vertical} — ${sow.useCaseType}`, account: "", owner: "", startDate: "" });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.name.trim() || !form.startDate) { alert("Project name and start date are required."); return; }
    setSaving(true);
    try {
      const start = new Date(form.startDate);
      const target = new Date(start);
      target.setDate(target.getDate() + (Number(sow.totalWeeks) || 0) * 7);
      const project = await projectsTable.create({
        name: form.name, account: form.account, vertical: sow.vertical, owner: form.owner,
        health: "Green", stage: "Discovery", startDate: form.startDate,
        targetDate: target.toISOString().slice(0, 10),
        notes: sow.narrative, sowId: sow.id,
      });
      onCreated(project);
    } catch (e) { alert("Failed to create project: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Create project from "${sow.vertical} / ${sow.useCaseType}"`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">The project inherits vertical and estimated duration from this SOW. Fill in what the SOW doesn't capture.</p>
      <Field label="Project name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Account"><input className={inputCls} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} /></Field>
      <Field label="Owner"><input className={inputCls} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
      <Field label="Start date (target date computed from SOW's estimated weeks)"><input type="date" className={inputCls} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
      <button onClick={create} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 inline-flex items-center gap-1.5 disabled:opacity-50"><Rocket size={14} /> {saving ? "Creating..." : "Create project"}</button>
    </Modal>
  );
}

export function SectionList({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-3">
      <span className="text-xs uppercase tracking-wide text-slate-400 font-mono">{title}</span>
      <ul className="text-xs text-slate-300 list-disc pl-4 mt-1 space-y-0.5">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}

export { lineTotal, OUT_OF_SCOPE_DEFAULTS };
