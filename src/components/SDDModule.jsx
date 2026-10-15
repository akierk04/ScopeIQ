import React, { useState } from "react";
import { ChevronDown, ChevronRight, Download, Trash2, Upload, Loader2 } from "lucide-react";
import { Field, AIButton, inputCls, download } from "./ui";
import { SectionList } from "./SOWModule";
import { sddsTable } from "../lib/storage";
import { callClaude } from "../lib/ai";
import { extractFile } from "../lib/fileExtract";

export default function SDDModule({ projects, sows, sdds, setSdds, settings }) {
  const [form, setForm] = useState({ projectId: "", sowId: "", context: "" });
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const vendor = settings.vendor_name || "Vendor";
  const linkedSow = sows.find((s) => s.id === form.sowId);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExtracting(true);
    try {
      const { text, truncated } = await extractFile(file);
      setForm((f) => ({ ...f, context: f.context ? `${f.context}\n\n--- ${file.name} ---\n${text}` : text + (truncated ? "\n[truncated]" : "") }));
    } catch (err) {
      alert("Couldn't read that file: " + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const generate = async () => {
    if (!form.context.trim() && !linkedSow) { alert("Link a SOW or paste/upload discovery context — the SDD needs something to work from."); return; }
    setGenerating(true); setDraft(null);
    try {
      const result = await callClaude(
        `You are drafting a Solution Design Document for ${vendor}, a B2B SaaS implementation vendor, describing how a specific customer implementation will be configured and built.
${linkedSow ? `Originating SOW: ${linkedSow.vertical} / ${linkedSow.useCaseType}. Scope summary: ${linkedSow.narrative}. In scope: ${(linkedSow.inScope || []).join("; ")}` : ""}
Additional context: ${form.context || "none"}

Return ONLY raw JSON, no markdown fences:
{
  "solutionOverview": "2-3 sentences describing what's being built and why",
  "benefits": ["business/customer benefit statements, 3-5 items max, one short sentence each"],
  "objectives": ["measurable objectives this design supports, 3-5 items max, one short sentence each"],
  "inScope": ["specific in-scope design elements, 3-6 items max, one short sentence each"],
  "outOfScope": ["specific exclusions, 3-5 items max, one short sentence each"],
  "assumptions": ["design-level assumptions, 3-5 items max, one short sentence each"],
  "risks": ["known risks or dependencies affecting the design, 3-5 items max, one short sentence each"],
  "architectureOverview": "2-4 sentences on the high-level architecture approach",
  "modules": [{"name": "module or component name", "requirements": ["functional requirement"], "acceptanceCriteria": ["specific, testable acceptance criterion"]}],
  "narrative": "1-2 sentence summary"
}
3-4 modules, each with 2-4 requirements and 2-4 acceptance criteria — keep every list item to one short sentence. This needs to fit in a single response; brevity matters more than exhaustiveness. Do not invent a vendor product catalog; describe modules generically (e.g. "Pricing configuration module", "Reporting module") unless the context names specific systems.`
      );
      setDraft(result);
    } catch (e) { alert("SDD generation failed: " + e.message); }
    finally { setGenerating(false); }
  };

  const saveDraft = async () => {
    if (!draft) return;
    try {
      const created = await sddsTable.create({ projectId: form.projectId, ...draft, status: "Draft" });
      setSdds([...sdds, created]);
      setDraft(null);
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const setStatus = async (sdd, status) => {
    try { const updated = await sddsTable.update(sdd.id, { ...sdd, status }); setSdds(sdds.map((s) => (s.id === sdd.id ? updated : s))); }
    catch (e) { alert("Update failed: " + e.message); }
  };
  const removeSdd = async (id) => { try { await sddsTable.remove(id); setSdds(sdds.filter((s) => s.id !== id)); } catch (e) { alert("Delete failed: " + e.message); } };

  const exportSdd = (s) => {
    const md = `# Solution Design Document

**${vendor}**

## Solution overview
${s.solutionOverview}

## Benefits
${(s.benefits || []).map((b) => `- ${b}`).join("\n")}

## Objectives
${(s.objectives || []).map((o) => `- ${o}`).join("\n")}

## In scope
${(s.inScope || []).map((i) => `- ${i}`).join("\n")}

## Out of scope
${(s.outOfScope || []).map((i) => `- ${i}`).join("\n")}

## Assumptions
${(s.assumptions || []).map((a) => `- ${a}`).join("\n")}

## Known risks / dependencies
${(s.risks || []).map((r) => `- ${r}`).join("\n")}

## Architecture overview
${s.architectureOverview}

## Design by module
${(s.modules || []).map((m) => `### ${m.name}\n**Requirements:**\n${(m.requirements || []).map((r) => `- ${r}`).join("\n")}\n**Acceptance criteria:**\n${(m.acceptanceCriteria || []).map((a) => `- ${a}`).join("\n")}`).join("\n\n")}
`;
    download(`SDD_${s.id.slice(0, 8)}.md`, md);
  };

  return (
    <div>
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg mb-5">
        <div className="grid grid-cols-2 gap-x-4">
          <Field label="Link to project (optional)"><select className={inputCls} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Link to SOW (recommended — carries scope into the design)"><select className={inputCls} value={form.sowId} onChange={(e) => setForm({ ...form, sowId: e.target.value })}><option value="">— none —</option>{sows.map((s) => <option key={s.id} value={s.id}>{s.vertical} / {s.useCaseType}</option>)}</select></Field>
        </div>
        <Field label="Additional discovery / design context"><textarea className={inputCls} rows={3} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} /></Field>
        <div className="flex items-center gap-3 mb-3">
          <label className="inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 cursor-pointer border border-teal-500/30 rounded-md px-3 py-1.5 bg-teal-500/10">
            {extracting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {extracting ? "Reading..." : "Upload doc (PDF, DOCX, XLSX, image)"}
            <input type="file" accept=".pdf,.docx,.xlsx,image/*" className="hidden" disabled={extracting} onChange={handleUpload} />
          </label>
        </div>
        <AIButton onClick={generate} busy={generating} label="Generate SDD draft" />
      </div>

      {draft && (
        <div className="mb-6 p-4 border border-teal-500/30 bg-teal-500/5 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-100">Draft Solution Design Document</h4>
            <button onClick={saveDraft} className="text-xs px-3 py-1.5 rounded-md bg-teal-500 text-slate-950 font-medium hover:bg-teal-400">Save to log</button>
          </div>
          <p className="text-sm text-slate-300 mb-3">{draft.solutionOverview}</p>
          <SectionList title="Benefits" items={draft.benefits} />
          <SectionList title="Objectives" items={draft.objectives} />
          <SectionList title="In scope" items={draft.inScope} />
          <SectionList title="Out of scope" items={draft.outOfScope} />
          <SectionList title="Assumptions" items={draft.assumptions} />
          <SectionList title="Risks / dependencies" items={draft.risks} />
          <div className="mb-3">
            <span className="text-xs uppercase tracking-wide text-slate-400 font-mono">Architecture overview</span>
            <p className="text-xs text-slate-300 mt-1">{draft.architectureOverview}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-wide text-slate-400 font-mono">Modules</span>
            <div className="mt-1.5 space-y-2">
              {(draft.modules || []).map((m, i) => (
                <div key={i} className="p-2.5 bg-slate-950 border border-slate-800 rounded-md">
                  <p className="text-sm text-slate-100 font-medium mb-1">{m.name}</p>
                  <p className="text-xs text-slate-500 mb-0.5">Requirements: {(m.requirements || []).join("; ")}</p>
                  <p className="text-xs text-slate-500">Acceptance criteria: {(m.acceptanceCriteria || []).join("; ")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 font-mono mb-2">{sdds.length} saved document{sdds.length === 1 ? "" : "s"}</div>
      <div className="space-y-2">
        {sdds.map((s) => (
          <div key={s.id} className="border border-slate-800 rounded-lg bg-slate-900/50">
            <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-100 font-medium">{s.solutionOverview?.slice(0, 60) || "Untitled"}...</span>
                <span className={`text-[10px] px-1.5 rounded border ${s.status === "Approved" ? "text-emerald-400 border-emerald-500/40" : "text-slate-400 border-slate-600"}`}>{s.status}</span>
              </div>
              {expanded === s.id ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
            </button>
            {expanded === s.id && (
              <div className="px-4 pb-4">
                <p className="text-sm text-slate-300 mb-2">{s.narrative}</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-slate-500">Status:</span>
                  <select className={inputCls + " max-w-[140px]"} value={s.status} onChange={(e) => setStatus(s, e.target.value)}>{["Draft", "Approved", "Rejected"].map((st) => <option key={st}>{st}</option>)}</select>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => exportSdd(s)} className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"><Download size={13} /> Export .md</button>
                  <button onClick={() => removeSdd(s.id)} className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
