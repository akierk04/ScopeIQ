import React, { useState } from "react";
import { Modal, Field, inputCls } from "./ui";
import { settingsTable } from "../lib/storage";

export default function SettingsModal({ settings, setSettings, onClose }) {
  const [form, setForm] = useState({ vendor_name: settings.vendor_name || "", product_name: settings.product_name || "" });
  const [saving, setSaving] = useState(false);

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

  return (
    <Modal title="Settings" onClose={onClose}>
      <Field label="Vendor name (appears on generated SOWs / Change Orders)">
        <input className={inputCls} value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
      </Field>
      <Field label="Product name">
        <input className={inputCls} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Cancel</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>
    </Modal>
  );
}
