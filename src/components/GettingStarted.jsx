import React, { useEffect, useState } from "react";
import { Check, Circle, ArrowRight, X } from "lucide-react";
import { db } from "../lib/supabaseClient";
import { computeSteps } from "../lib/gettingStarted";

const HIDE_KEY = "scopeiq_getting_started_hidden";
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };
const writeHidden = (v) => { try { v ? localStorage.setItem(HIDE_KEY, "1") : localStorage.removeItem(HIDE_KEY); } catch { /* storage unavailable: it just won't be remembered */ } };

// Row counts only (head request), scoped to the signed-in user by the database's own access rules.
async function count(table, eq) {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
  const { count: c, error } = await q;
  if (error) throw error;
  return c || 0;
}

// Not a bot and not AI: a fixed list of steps that ticks itself off from what actually
// exists in this user's workspace, and points at the next one.
export default function GettingStarted({ settings, projects, onNavigate, onOpenSettings, onOpenProject }) {
  const [facts, setFacts] = useState(null);
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // allSettled: if one check fails, that step just shows as not done. It never blocks the page.
      const keys = ["models", "findings", "integrations", "profiles", "confirmedMappings", "dataSpecEntities"];
      const results = await Promise.allSettled([
        count("target_models"), count("discovery_findings"), count("integrations"),
        count("source_profiles"), count("field_mappings", { status: "confirmed" }), count("data_spec_entities"),
      ]);
      if (cancelled) return;
      const f = {};
      results.forEach((r, i) => { f[keys[i]] = r.status === "fulfilled" ? r.value : 0; });
      setFacts(f);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!facts) return null;
  const { steps, doneCount, total, nextId, complete } = computeSteps({ ...facts, settings, projects: projects.length });

  if (hidden) {
    return (
      <div className="mb-4">
        <button onClick={() => { writeHidden(false); setHidden(false); }} className="text-xs text-slate-500 hover:text-slate-300 font-mono">
          Show getting started ({doneCount} of {total} done)
        </button>
      </div>
    );
  }

  const act = (a) => {
    if (a.type === "settings") onOpenSettings();
    else if (a.type === "tab") onNavigate(a.tab);
    else if (a.type === "project") { if (projects[0]) onOpenProject(projects[0].id); else onNavigate("portfolio"); }
  };

  return (
    <div className="mb-6 border border-teal-500/30 bg-teal-500/5 rounded-lg p-4" data-testid="getting-started">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{complete ? "You've been through every step" : "Getting started"}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {doneCount} of {total} done. Steps tick themselves off from what is in your workspace.
          </p>
        </div>
        <button onClick={() => { writeHidden(true); setHidden(true); }} className="text-slate-500 hover:text-slate-300" title="Hide this panel"><X size={14} /></button>
      </div>
      <div className="h-1.5 bg-slate-800 rounded mb-3 overflow-hidden"><div className="h-full bg-teal-500" style={{ width: `${(doneCount / total) * 100}%` }} /></div>
      <ol className="space-y-2">
        {steps.map((st) => {
          const isNext = st.id === nextId;
          return (
            <li key={st.id} className={`flex items-start gap-3 p-2.5 rounded-md ${isNext ? "bg-slate-900 border border-teal-500/30" : ""}`}>
              {st.done ? <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : <Circle size={16} className={`mt-0.5 shrink-0 ${isNext ? "text-teal-400" : "text-slate-600"}`} />}
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${st.done ? "text-slate-500 line-through" : "text-slate-100"}`}>{st.title}{isNext && <span className="ml-2 text-[10px] uppercase tracking-wide text-teal-300 font-mono">Next</span>}</div>
                {!st.done && <div className="text-xs text-slate-400 mt-0.5">{st.detail}</div>}
              </div>
              {isNext && (
                <button onClick={() => act(st.action)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400">
                  {st.action.label} <ArrowRight size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
