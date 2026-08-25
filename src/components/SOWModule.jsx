import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";
import { Field, AIButton, inputCls, download } from "./ui";
import { sowsTable } from "../lib/storage";
import { callClaude } from "../lib/ai";

export default function SOWModule({ projects, sows, setSows }) {
  const [form, setForm] = useState({ projectId: "", vertical: "", useCaseType: "", complexity: "Medium", pasteContext: "" });
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const generate = async () => {
    if (!form.vertical.trim() || !form.useCaseType.trim()) { alert("Vertical and use case type are required."); return; }
    setGenerating(true); setDraft(null);
    try {
      const result = await callClaude(
        `You are estimating a B2B SaaS implementation SOW for a CX/professional services team (pricing & revenue optimization software, similar effort model to Zilliant-style deployments).
Vertical: ${form.vertical}
Use case type: ${form.useCaseType}
Complexity: ${form.complexity}
Additional context: ${form.pasteContext || "none"}
Note: these are general professional-services estimation priors, not derived from this organization's actual historical projects.

Return ONLY raw JSON, no markdown fences:
{"totalWeeks":0,"totalHours":0,"phases":[{"name":"","weeks":0,"hours":0,"description":""}],"assumptions":["",""],"narrative":"2-3 sentence scope summary in plain professional-services language"}
Base phase breakdown on a typical Discovery -> Configuration -> Integration -> UAT -> Go-live -> Hypercare structure, adjusted for complexity.`
      );
      setDraft(result);
    } catch (e) { alert("SOW generation failed: " + e.message); }
    finally { setGenerating(false); }
  };

  const saveDraft = async () => {
    if (!draft) return;
    try { const created = await sowsTable.create({ ...form, ...draft }); setSows([...sows, created]); setDraft(null); }
    catch (e) { alert("Save failed: " + e.message); }
  };

  const exportSow = (s) => {
    const md = `# Statement of Work — ${s.vertical} / ${s.useCaseType}

**Complexity:** ${s.complexity}
**Estimated duration:** ${s.totalWeeks} weeks (${s.totalHours} hours)
**Estimate basis:** general professional-services priors (not yet calibrated against this org's historical actuals)

## Scope summary
${s.narrative}

## Phase breakdown
${s.phases.map((p) => `- **${p.name}** — ${p.weeks} wks / ${p.hours} hrs. ${p.description}`).join("\n")}

## Assumptions
${(s.assumptions || []).map((a) => `- ${a}`).join("\n")}
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
        </div>
        <Field label="Paste scope notes / prior SOW excerpt (optional context)"><textarea className={inputCls} rows={3} value={form.pasteContext} onChange={(e) => setForm({ ...form, pasteContext: e.target.value })} /></Field>
        <AIButton onClick={generate} busy={generating} label="Generate estimate" />
      </div>
      {draft && (
        <div className="mb-6 p-4 border border-teal-500/30 bg-teal-500/5 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-100">Draft estimate — {draft.totalWeeks} wks / {draft.totalHours} hrs</h4>
            <button onClick={saveDraft} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Save to log</button>
          </div>
          <p className="text-xs text-amber-400/80 mb-2">General priors, not yet grounded in your closed-project actuals — check the Closeout tab on comparable projects once you have some.</p>
          <p className="text-sm text-slate-300 mb-3">{draft.narrative}</p>
          <div className="space-y-1.5 mb-3">{draft.phases.map((p, i) => (<div key={i} className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-1.5"><span className="text-slate-200">{p.name}</span><span>{p.weeks}wk / {p.hours}hr</span></div>))}</div>
          {draft.assumptions?.length > 0 && <ul className="text-xs text-slate-500 list-disc pl-4">{draft.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
        </div>
      )}
      <div className="text-xs text-slate-400 font-mono mb-2">{sows.length} saved estimate{sows.length === 1 ? "" : "s"}</div>
      <div className="space-y-2">
        {sows.map((s) => (
          <div key={s.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
            <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
              <div><span className="text-sm text-slate-100 font-medium">{s.vertical} — {s.useCaseType}</span><span className="text-xs text-slate-500 ml-2 font-mono">{s.totalWeeks}wk / {s.totalHours}hr / {s.complexity}</span></div>
              {expanded === s.id ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
            </button>
            {expanded === s.id && (
              <div className="px-4 pb-4">
                <p className="text-sm text-slate-300 mb-2">{s.narrative}</p>
                {s.phases.map((p, i) => (<div key={i} className="flex justify-between text-xs font-mono text-slate-400 border-t border-slate-800 pt-1.5"><span className="text-slate-200">{p.name}</span><span>{p.weeks}wk / {p.hours}hr</span></div>))}
                <div className="flex gap-3 mt-3">
                  <button onClick={() => exportSow(s)} className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"><Download size={13} /> Export .md</button>
                  <button onClick={() => removeSow(s.id)} className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
