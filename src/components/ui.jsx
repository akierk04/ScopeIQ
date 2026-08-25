import React from "react";
import { X, Sparkles, Loader2 } from "lucide-react";

export const HEALTH = {
  Green: { bg: "bg-emerald-500", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  Amber: { bg: "bg-amber-500", text: "text-amber-400", ring: "ring-amber-500/30" },
  Red: { bg: "bg-rose-500", text: "text-rose-400", ring: "ring-rose-500/30" },
};
export const LEVEL_COLOR = {
  Low: "text-emerald-400 border-emerald-500/40",
  Medium: "text-amber-400 border-amber-500/40",
  High: "text-rose-400 border-rose-500/40",
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const inputCls = "w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-500";

export function download(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Badge({ health }) {
  const h = HEALTH[health] || HEALTH.Amber;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wide ring-1 ${h.ring} ${h.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${h.bg}`} /> {health}
    </span>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs uppercase tracking-wide text-slate-400 mb-1 font-mono">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className={`bg-slate-900 border border-slate-700 rounded-lg shadow-2xl ${wide ? "w-full max-w-2xl" : "w-full max-w-md"} mx-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function AIButton({ onClick, label = "AI assist", busy }) {
  return (
    <button onClick={onClick} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-teal-500/10 text-teal-300 border border-teal-500/30 hover:bg-teal-500/20 disabled:opacity-50">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {busy ? "Working..." : label}
    </button>
  );
}

export function EmptyState({ text }) {
  return <div className="border border-dashed border-slate-800 rounded-lg py-10 text-center text-sm text-slate-500">{text}</div>;
}
