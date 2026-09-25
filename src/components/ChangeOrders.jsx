import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download, Trash2, Plus, X } from "lucide-react";
import { Field, AIButton, inputCls, download } from "./ui";
import { changeOrdersTable } from "../lib/storage";
import { callClaude } from "../lib/ai";
import { SectionList, lineTotal } from "./SOWModule";

export default function ChangeOrders({ sows, changeOrders, setChangeOrders, roles, projects, settings }) {
  const [sowId, setSowId] = useState(sows[0]?.id || "");
  const [changeContext, setChangeContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const vendor = settings.vendor_name || "Vendor";
  const sourceSow = sows.find((s) => s.id === sowId);
  const projectName = (id) => projects.find((p) => p.id === id)?.name || "";

  const generate = async () => {
    if (!sourceSow) { alert("Select a source SOW first."); return; }
    if (!changeContext.trim()) { alert("Describe what's changing."); return; }
    if (roles.length === 0) { alert("Add roles to the Rate Card first."); return; }
    setGenerating(true); setDraft(null);
    try {
      const result = await callClaude(
        `You are drafting a Change Order to an existing SOW for ${vendor}.
Original SOW: ${sourceSow.vertical} / ${sourceSow.useCaseType}, original scope summary: ${sourceSow.narrative}
Original in-scope items: ${(sourceSow.inScope || []).join("; ") || "none recorded"}
Requested change: ${changeContext}
Available resource roles: ${roles.map((r) => r.name).join(", ")}

Return ONLY raw JSON, no markdown fences:
{
  "objective": "one sentence: what this Change Order accomplishes",
  "originalSowTerms": "one sentence: which part of the original SOW this affects",
  "changes": ["specific bullet list of changes being made, in the style of a real SOW change order"],
  "assumptions": ["3-6 assumptions specific to this change"],
  "resourceLines": [{"role":"<one of the available roles above, exactly>","hours":0}],
  "narrative": "1-2 sentence summary"
}
Do not include dollar amounts. Do not invent roles not in the available list.`
      );
      setDraft(result);
    } catch (e) { alert("Change Order generation failed: " + e.message); }
    finally { setGenerating(false); }
  };

  const totalCost = (d) => (d?.resourceLines || []).reduce((sum, l) => sum + lineTotal(l, roles), 0);
  const totalHours = (d) => (d?.resourceLines || []).reduce((sum, l) => sum + (Number(l.hours) || 0), 0);
  const updateDraftLine = (idx, patch) => { const lines = [...draft.resourceLines]; lines[idx] = { ...lines[idx], ...patch }; setDraft({ ...draft, resourceLines: lines }); };
  const addDraftLine = () => setDraft({ ...draft, resourceLines: [...draft.resourceLines, { role: roles[0]?.name || "", hours: 0 }] });
  const removeDraftLine = (idx) => setDraft({ ...draft, resourceLines: draft.resourceLines.filter((_, i) => i !== idx) });

  const saveDraft = async () => {
    if (!draft) return;
    try {
      const changeOrderNumber = changeOrders.filter((c) => c.sowId === sowId).length + 1;
      const created = await changeOrdersTable.create({
        sowId, projectId: sourceSow.projectId, changeOrderNumber, objective: draft.objective,
        originalSowTerms: draft.originalSowTerms, changes: draft.changes, assumptions: draft.assumptions,
        resourceLines: draft.resourceLines, totalFee: totalCost(draft), narrative: draft.narrative,
      });
      setChangeOrders([...changeOrders, created]);
      setDraft(null); setChangeContext("");
    } catch (e) { alert("Save failed: " + e.message); }
  };
  const removeCo = async (id) => { try { await changeOrdersTable.remove(id); setChangeOrders(changeOrders.filter((c) => c.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  const exportCo = (c) => {
    const sow = sows.find((s) => s.id === c.sowId);
    const cost = (c.resourceLines || []).reduce((sum, l) => sum + lineTotal(l, roles), 0);
    const md = `# Change Order ${c.changeOrderNumber} to SOW

**${vendor}** — ${sow ? `${sow.vertical} / ${sow.useCaseType}` : "Original SOW"}

## Objective
${c.objective}

## Original SOW terms affected
${c.originalSowTerms}

## Change(s) pursuant to this Change Order
${(c.changes || []).map((ch) => `- ${ch}`).join("\n")}

## Assumptions
${(c.assumptions || []).map((a) => `- ${a}`).join("\n")}

## Resourcing and fees
${(c.resourceLines || []).map((l) => `- **${l.role}** — ${l.hours} hrs`).join("\n")}

**Total: ${(c.resourceLines || []).reduce((sum, l) => sum + (Number(l.hours) || 0), 0)} hours, $${cost.toLocaleString()} estimated**
`;
    download(`ChangeOrder_${c.changeOrderNumber}.md`, md);
  };

  if (sows.length === 0) {
    return <div className="text-sm text-slate-500 border border-dashed border-slate-800 rounded-lg py-10 text-center">No SOWs saved yet — create one in the SOW generator first, then Change Orders can reference it.</div>;
  }

  return (
    <div>
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg mb-5">
        <Field label="Source SOW">
          <select className={inputCls} value={sowId} onChange={(e) => setSowId(e.target.value)}>
            {sows.map((s) => <option key={s.id} value={s.id}>{s.vertical} / {s.useCaseType}{s.projectId ? ` — ${projectName(s.projectId)}` : ""}</option>)}
          </select>
        </Field>
        <Field label="What's changing?"><textarea className={inputCls} rows={3} placeholder="Describe the requested change..." value={changeContext} onChange={(e) => setChangeContext(e.target.value)} /></Field>
        <AIButton onClick={generate} busy={generating} label="Generate Change Order" />
      </div>

      {draft && (
        <div className="mb-6 p-4 border border-teal-500/30 bg-teal-500/5 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-100">Draft CO — {totalHours(draft)} hrs / ${totalCost(draft).toLocaleString()}</h4>
            <button onClick={saveDraft} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Save</button>
          </div>
          <p className="text-sm text-slate-300 mb-1"><span className="text-slate-500">Objective:</span> {draft.objective}</p>
          <p className="text-sm text-slate-300 mb-3"><span className="text-slate-500">Affects:</span> {draft.originalSowTerms}</p>
          <SectionList title="Changes" items={draft.changes} />
          <SectionList title="Assumptions" items={draft.assumptions} />
          <div className="mt-3">
            <span className="text-xs uppercase tracking-wide text-slate-400 font-mono">Resourcing</span>
            <div className="mt-1.5 space-y-1.5">
              {draft.resourceLines.map((l, i) => {
                const role = roles.find((r) => r.name === l.role);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <select className={inputCls} value={l.role} onChange={(e) => updateDraftLine(i, { role: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</select>
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

      <div className="text-xs text-slate-400 font-mono mb-2">{changeOrders.length} change order{changeOrders.length === 1 ? "" : "s"}</div>
      <div className="space-y-2">
        {changeOrders.map((c) => {
          const sow = sows.find((s) => s.id === c.sowId);
          return (
            <div key={c.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div><span className="text-sm text-slate-100 font-medium">CO {c.changeOrderNumber} — {sow ? `${sow.vertical} / ${sow.useCaseType}` : "Unknown SOW"}</span><span className="text-xs text-slate-500 ml-2 font-mono">${(c.totalFee || 0).toLocaleString()}</span></div>
                {expanded === c.id ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
              </button>
              {expanded === c.id && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-slate-300 mb-2">{c.narrative}</p>
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => exportCo(c)} className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"><Download size={13} /> Export .md</button>
                    <button onClick={() => removeCo(c.id)} className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"><Trash2 size={13} /> Delete</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
