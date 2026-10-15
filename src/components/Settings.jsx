import React, { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Modal, Field, inputCls } from "./ui";
import { settingsTable, adminTable, allowedEmailsTable } from "../lib/storage";

export default function SettingsModal({ settings, setSettings, onClose }) {
  const [form, setForm] = useState({ vendor_name: settings.vendor_name || "", product_name: settings.product_name || "" });
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [invites, setInvites] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    adminTable.amIAdmin().then((admin) => {
      setIsAdmin(admin);
      if (admin) allowedEmailsTable.list().then(setInvites);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await settingsTable.set("vendor_name", form.vendor_name);
      await settingsTable.set("product_name", form.product_name);
      setSettings({ ...settings, ...form });
      onClose();
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const addInvite = async () => {
    if (!newEmail.trim()) return;
    setInviteBusy(true);
    try {
      await allowedEmailsTable.add(newEmail);
      setInvites(await allowedEmailsTable.list());
      setNewEmail("");
    } catch (e) { alert("Couldn't add invite: " + e.message); }
    finally { setInviteBusy(false); }
  };
  const removeInvite = async (email) => {
    try { await allowedEmailsTable.remove(email); setInvites(invites.filter((i) => i.email !== email)); }
    catch (e) { alert("Couldn't remove invite: " + e.message); }
  };

  return (
    <Modal title="Settings" onClose={onClose} wide={isAdmin}>
      <Field label="Vendor name (appears on generated SOWs / Change Orders)">
        <input className={inputCls} value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
      </Field>
      <Field label="Product name">
        <input className={inputCls} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
      </Field>
      <p className="text-xs text-slate-600 mb-2">These apply only to your account — other registered users set their own.</p>

      <div className="flex justify-end gap-2 mt-2 mb-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Cancel</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>

      {isAdmin && (
        <div className="mt-5 pt-4 border-t border-slate-800">
          <h4 className="text-xs uppercase tracking-wide text-slate-400 font-mono mb-2">Invite allowlist (admin only)</h4>
          <p className="text-xs text-slate-600 mb-3">Only these emails can register. You're seeing this because your account is an admin.</p>
          <div className="flex gap-2 mb-3">
            <input className={inputCls + " mb-0"} placeholder="email@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <button onClick={addInvite} disabled={inviteBusy} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50 shrink-0">Add</button>
          </div>
          <div className="space-y-1.5">
            {invites.map((i) => (
              <div key={i.email} className="flex items-center justify-between px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md">
                <span className="text-xs text-slate-300">{i.email}</span>
                <button onClick={() => removeInvite(i.email)} className="text-slate-600 hover:text-rose-400"><Trash2 size={13} /></button>
              </div>
            ))}
            {invites.length === 0 && <p className="text-xs text-slate-600">No invites yet.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
