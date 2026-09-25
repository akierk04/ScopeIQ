import React, { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { inputCls, EmptyState } from "./ui";
import { rolesTable } from "../lib/storage";

export default function RateCard({ roles, setRoles }) {
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [dirty, setDirty] = useState({});

  const add = async () => {
    if (!newName.trim()) return;
    try {
      const created = await rolesTable.create({ name: newName, hourlyRate: newRate ? Number(newRate) : null });
      setRoles([...roles, created]);
      setNewName(""); setNewRate("");
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const updateLocal = (id, patch) => {
    setRoles(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty({ ...dirty, [id]: true });
  };

  const save = async (id) => {
    const role = roles.find((r) => r.id === id);
    try {
      const updated = await rolesTable.update(id, role);
      setRoles(roles.map((r) => (r.id === id ? updated : r)));
      setDirty({ ...dirty, [id]: false });
    } catch (e) { alert("Save failed: " + e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this role? SOWs/Change Orders that already reference it keep their saved hours and cost, just lose the live rate link.")) return;
    try { await rolesTable.remove(id); setRoles(roles.filter((r) => r.id !== id)); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  return (
    <div className="max-w-2xl">
      <p className="text-xs text-slate-500 mb-4">
        This is the source of truth for cost on SOWs and Change Orders. AI proposes hours per role based on scope; the dollar amounts always come from the rates you set here, never from the model.
      </p>
      {roles.length === 0 ? <EmptyState text="No roles yet. Add your resource roles and their hourly rates." /> : (
        <div className="border border-slate-800 rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase font-mono">
              <tr><th className="text-left px-4 py-2">Role</th><th className="text-left px-4 py-2">Hourly rate</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="px-4 py-2"><input className={inputCls} value={r.name} onChange={(e) => updateLocal(r.id, { name: e.target.value })} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">$</span>
                      <input className={inputCls + " max-w-[120px]"} type="number" value={r.hourlyRate || ""} onChange={(e) => updateLocal(r.id, { hourlyRate: e.target.value })} />
                      <span className="text-slate-500 text-xs">/hr</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {dirty[r.id] && <button onClick={() => save(r.id)} className="text-teal-400 hover:text-teal-300 mr-3 inline-flex items-center gap-1"><Save size={13} /> Save</button>}
                    <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-2 p-3 border border-dashed border-slate-700 rounded-md">
        <input className={inputCls} placeholder="Role name, e.g. Data Architect" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <div className="flex items-center gap-1">
          <span className="text-slate-500">$</span>
          <input className={inputCls + " max-w-[120px]"} type="number" placeholder="Rate" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
        </div>
        <button onClick={add} className="text-teal-400 hover:text-teal-300 shrink-0"><Plus size={18} /></button>
      </div>
    </div>
  );
}
