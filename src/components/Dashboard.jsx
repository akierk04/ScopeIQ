import React, { useMemo } from "react";
import { AlertTriangle, Calendar, Rocket, ShieldAlert, ArrowRight } from "lucide-react";
import { Badge, EmptyState } from "./ui";
import { assessProjectHealth } from "../lib/health";

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
};

export default function Dashboard({ projects, milestones, dependencies, risks, changeRequests, onOpenProject }) {
  const msByProject = useMemo(() => groupBy(milestones, "projectId"), [milestones]);
  const depByProject = useMemo(() => groupBy(dependencies, "projectId"), [dependencies]);
  const riskByProject = useMemo(() => groupBy(risks, "projectId"), [risks]);
  const crByProject = useMemo(() => groupBy(changeRequests, "projectId"), [changeRequests]);

  const assessments = useMemo(() => {
    const map = {};
    for (const p of projects) {
      map[p.id] = assessProjectHealth({
        milestones: msByProject[p.id] || [],
        dependencies: depByProject[p.id] || [],
        risks: riskByProject[p.id] || [],
        changeRequests: crByProject[p.id] || [],
      });
    }
    return map;
  }, [projects, msByProject, depByProject, riskByProject, crByProject]);

  const counts = { Green: 0, Amber: 0, Red: 0 };
  projects.forEach((p) => counts[p.health] !== undefined && counts[p.health]++);

  const mismatches = projects.filter((p) => assessments[p.id]?.assessment !== p.health);
  const needsAttention = projects.filter((p) => p.health !== "Green" || assessments[p.id]?.assessment !== "Green");

  const upcomingMilestones = milestones
    .filter((m) => m.status !== "Done" && m.dueDate && daysUntil(m.dueDate) >= 0 && daysUntil(m.dueDate) <= 14)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const overdueDeps = dependencies.filter((d) => d.status !== "Received" && d.dueDate && daysUntil(d.dueDate) < 0);

  const criticalRisks = risks.filter((r) => r.status === "Open" && r.impact === "High");

  const upcomingGoLives = projects
    .filter((p) => p.targetDate && daysUntil(p.targetDate) >= 0 && daysUntil(p.targetDate) <= 30)
    .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));

  const projectName = (id) => projects.find((p) => p.id === id)?.name || "Unknown";

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {["Green", "Amber", "Red"].map((h) => (
          <div key={h} className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
            <div className="text-2xl font-semibold text-slate-100">{counts[h]}</div>
            <Badge health={h} />
          </div>
        ))}
      </div>

      <Section icon={AlertTriangle} title="Where you need to pay attention today" tone="amber">
        {needsAttention.length === 0 ? <EmptyState text="Nothing flagged. Everything's reporting Green with no system-detected issues." /> : (
          <div className="space-y-2">
            {needsAttention.map((p) => {
              const a = assessments[p.id];
              const mismatch = a.assessment !== p.health;
              return (
                <button key={p.id} onClick={() => onOpenProject(p.id)} className="w-full text-left p-3.5 bg-slate-900/50 border border-slate-800 rounded-lg hover:border-slate-700 block">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-100">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">PM: </span><Badge health={p.health} />
                      <span className="text-[10px] font-mono text-slate-500">System: </span><Badge health={a.assessment} />
                    </div>
                  </div>
                  {mismatch && <div className="text-xs text-amber-400 mb-1 font-medium">Health mismatch detected</div>}
                  {a.reasons.length > 0 && (
                    <ul className="text-xs text-slate-400 list-disc pl-4 space-y-0.5">
                      {a.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <Section icon={Calendar} title="Upcoming milestones (14 days)" tone="slate" compact>
          {upcomingMilestones.length === 0 ? <p className="text-xs text-slate-500">None due.</p> : (
            <ul className="space-y-1.5">
              {upcomingMilestones.map((m) => (
                <li key={m.id} className="text-xs flex justify-between">
                  <button onClick={() => onOpenProject(m.projectId)} className="text-slate-300 hover:text-teal-400 text-left">{m.name} <span className="text-slate-600">— {projectName(m.projectId)}</span></button>
                  <span className="font-mono text-slate-500 shrink-0 ml-2">{m.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={ShieldAlert} title="Overdue dependencies" tone="slate" compact>
          {overdueDeps.length === 0 ? <p className="text-xs text-slate-500">None overdue.</p> : (
            <ul className="space-y-1.5">
              {overdueDeps.map((d) => (
                <li key={d.id} className="text-xs flex justify-between">
                  <button onClick={() => onOpenProject(d.projectId)} className="text-slate-300 hover:text-teal-400 text-left">{d.name} <span className="text-slate-600">— {projectName(d.projectId)}</span></button>
                  <span className="font-mono text-rose-400 shrink-0 ml-2">{d.dueDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={AlertTriangle} title="Open critical risks (High impact)" tone="slate" compact>
          {criticalRisks.length === 0 ? <p className="text-xs text-slate-500">None open.</p> : (
            <ul className="space-y-1.5">
              {criticalRisks.map((r) => (
                <li key={r.id} className="text-xs">
                  <button onClick={() => onOpenProject(r.projectId)} className="text-slate-300 hover:text-teal-400 text-left block">{r.description}</button>
                  <span className="text-slate-600">{projectName(r.projectId)}{!r.mitigation?.trim() && <span className="text-rose-400"> · no mitigation</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Rocket} title="Upcoming go-lives (30 days)" tone="slate" compact>
          {upcomingGoLives.length === 0 ? <p className="text-xs text-slate-500">None scheduled.</p> : (
            <ul className="space-y-1.5">
              {upcomingGoLives.map((p) => (
                <li key={p.id} className="text-xs flex justify-between">
                  <button onClick={() => onOpenProject(p.id)} className="text-slate-300 hover:text-teal-400 text-left">{p.name}</button>
                  <span className="font-mono text-slate-500 shrink-0 ml-2">{p.targetDate}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children, compact }) {
  return (
    <div className={compact ? "p-4 bg-slate-900/30 border border-slate-800 rounded-lg" : "mb-2"}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-slate-400" />
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}
