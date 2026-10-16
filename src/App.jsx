import React, { useState, useEffect } from "react";
import { LayoutDashboard, LayoutGrid, FileText, FileEdit, FileStack, Database, Workflow, DollarSign, Boxes, Loader2, LogOut, Settings as SettingsIcon } from "lucide-react";
import { db } from "./lib/supabaseClient";
import {
  projectsTable, milestonesTable, dependenciesTable, risksTable, changeRequestsTable, sowsTable,
  rolesTable, changeOrdersTable, settingsTable, sddsTable,
} from "./lib/storage";
import Login from "./Login";
import Dashboard from "./components/Dashboard";
import Portfolio from "./components/Portfolio";
import ProjectDetail from "./components/ProjectDetail";
import Blueprints from "./components/Blueprints";
import SOWModule from "./components/SOWModule";
import ChangeOrders from "./components/ChangeOrders";
import RateCard from "./components/RateCard";
import SettingsModal from "./components/Settings";
import SDDModule from "./components/SDDModule";
import DataSpecification from "./components/DataSpecification";
import DataModel from "./components/DataModel";
import GettingStarted from "./components/GettingStarted";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "portfolio", label: "Portfolio", icon: LayoutGrid },
  { id: "blueprints", label: "Blueprints", icon: Workflow },
  { group: "Contracts", items: [
    { id: "sow", label: "SOW generator", icon: FileText },
    { id: "changeorders", label: "Change Orders", icon: FileEdit },
  ] },
  { group: "Project Artifacts", items: [
    { id: "dataspec", label: "Data Specification", icon: Database },
    { id: "sdd", label: "Solution Design", icon: FileStack },
  ] },
  { id: "ratecard", label: "Rate Card", icon: DollarSign },
  { id: "datamodel", label: "Data Model", icon: Boxes },
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("dashboard");
  const [loaded, setLoaded] = useState(false);
  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [risks, setRisks] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [sows, setSows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [changeOrders, setChangeOrders] = useState([]);
  const [sdds, setSdds] = useState([]);
  const [settings, setSettings] = useState({});
  const [openProjectId, setOpenProjectId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAll = async () => {
    const [p, m, d, r, c, s, ro, co, st, sd] = await Promise.all([
      projectsTable.list(), milestonesTable.list(), dependenciesTable.list(), risksTable.list(),
      changeRequestsTable.list(), sowsTable.list(), rolesTable.list(), changeOrdersTable.list(), settingsTable.getAll(),
      sddsTable.list(),
    ]);
    setProjects(p); setMilestones(m); setDependencies(d); setRisks(r); setChangeRequests(c);
    setSows(s); setRoles(ro); setChangeOrders(co); setSettings(st); setSdds(sd);
  };

  useEffect(() => {
    if (!session) return;
    loadAll().catch((e) => alert("Failed to load data: " + e.message)).finally(() => setLoaded(true));
  }, [session]);

  if (session === undefined) return <Loading text="Checking session..." />;
  if (!session) return <Login />;
  if (!loaded) return <Loading text="Loading workspace..." />;

  const openProject = (id) => { setOpenProjectId(id); setTab("portfolio"); };
  const activeProject = projects.find((p) => p.id === openProjectId);

  const counts = {
    Green: projects.filter((p) => p.health === "Green").length,
    Amber: projects.filter((p) => p.health === "Amber").length,
    Red: projects.filter((p) => p.health === "Red").length,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{settings.product_name || "ScopeIQ"}</h1>
            <p className="text-xs text-slate-500 font-mono">{settings.vendor_name ? `${settings.vendor_name} · ` : ""}Projects are the hub — everything else hangs off them</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-emerald-400">{counts.Green} Green</span>
            <span className="text-amber-400">{counts.Amber} Amber</span>
            <span className="text-rose-400">{counts.Red} Red</span>
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 border-l border-slate-800 pl-4"><SettingsIcon size={13} /> Settings</button>
            <button onClick={() => db.auth.signOut()} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300"><LogOut size={13} /> Sign out</button>
          </div>
        </div>
      </div>
      <div className="flex">
        <nav className="w-52 shrink-0 border-r border-slate-800 min-h-[calc(100vh-73px)] px-3 py-4">
          {NAV.map((entry, i) =>
            entry.group ? (
              <div key={entry.group} className="mb-1">
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wide text-slate-600 font-mono">{entry.group}</div>
                {entry.items.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => { setTab(t.id); setOpenProjectId(null); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm mb-1 ${tab === t.id ? "bg-teal-500/10 text-teal-300 border border-teal-500/30" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`}>
                      <Icon size={16} /> {t.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button key={entry.id} onClick={() => { setTab(entry.id); if (entry.id !== "portfolio") setOpenProjectId(null); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm mb-1 ${tab === entry.id ? "bg-teal-500/10 text-teal-300 border border-teal-500/30" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"}`}>
                <entry.icon size={16} /> {entry.label}
              </button>
            )
          )}
        </nav>
        <main className="flex-1 p-6 min-w-0">
          {tab === "dashboard" && (
            <GettingStarted settings={settings} projects={projects} onNavigate={(t) => { setTab(t); setOpenProjectId(null); }} onOpenSettings={() => setSettingsOpen(true)} onOpenProject={openProject} />
          )}
          {tab === "dashboard" && (
            <Dashboard projects={projects} milestones={milestones} dependencies={dependencies} risks={risks} changeRequests={changeRequests} onOpenProject={openProject} />
          )}
          {tab === "portfolio" && !activeProject && <Portfolio projects={projects} setProjects={setProjects} onOpenProject={openProject} />}
          {tab === "portfolio" && activeProject && (
            <ProjectDetail
              project={activeProject}
              sows={sows}
              onBack={() => setOpenProjectId(null)}
              onUpdated={(updated) => setProjects(projects.map((p) => (p.id === updated.id ? updated : p)))}
              onDeleted={() => { setProjects(projects.filter((p) => p.id !== activeProject.id)); setOpenProjectId(null); }}
            />
          )}
          {tab === "blueprints" && <Blueprints onProjectCreated={(id) => { loadAll(); openProject(id); }} />}
          {tab === "sow" && <SOWModule projects={projects} sows={sows} setSows={setSows} roles={roles} settings={settings} onProjectCreated={(id) => { loadAll(); openProject(id); }} />}
          {tab === "changeorders" && <ChangeOrders sows={sows} changeOrders={changeOrders} setChangeOrders={setChangeOrders} roles={roles} projects={projects} settings={settings} />}
          {tab === "sdd" && <SDDModule projects={projects} sows={sows} sdds={sdds} setSdds={setSdds} settings={settings} />}
          {tab === "dataspec" && <DataSpecification projects={projects} />}
          {tab === "ratecard" && <RateCard roles={roles} setRoles={setRoles} />}
          {tab === "datamodel" && <DataModel />}
        </main>
      </div>
      {settingsOpen && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Loading({ text }) {
  return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm font-mono"><Loader2 className="animate-spin mr-2" size={16} /> {text}</div>;
}
