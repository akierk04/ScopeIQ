import React, { useState } from "react";
import { db } from "./lib/supabaseClient";
import { allowedEmailsTable } from "./lib/storage";

const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500/60";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  const register = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const allowed = await allowedEmailsTable.isAllowed(email);
      if (!allowed) {
        setError("This email hasn't been invited yet — ask the admin to add you first.");
        setBusy(false);
        return;
      }
      const { error: signUpError } = await db.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); setBusy(false); return; }
      setNotice("Account created. If your project requires email confirmation, check your inbox before signing in. Otherwise, you can sign in now.");
      setMode("signin");
    } catch (e) {
      setError("Couldn't check the invite list: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={mode === "signin" ? signIn : register} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-slate-100 mb-1">ScopeIQ</h1>
        <p className="text-xs text-slate-500 mb-5 font-mono">{mode === "signin" ? "Sign in to continue" : "Create an account"}</p>

        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />

        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
        {notice && <p className="text-xs text-emerald-400 mb-3">{notice}</p>}

        <button disabled={busy} className="w-full py-2 rounded-md text-sm font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50">
          {busy ? "Working..." : mode === "signin" ? "Sign in" : "Register"}
        </button>

        <button type="button" onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setError(""); setNotice(""); }} className="w-full text-center text-xs text-teal-400 hover:text-teal-300 mt-3">
          {mode === "signin" ? "Don't have an account? Register" : "Already have an account? Sign in"}
        </button>

        {mode === "register" && (
          <p className="text-xs text-slate-600 mt-4">
            Registration only works for emails an admin has invited. Each account gets its own private projects, rate card, and vendor/product name — nothing is shared with other accounts.
          </p>
        )}
      </form>
    </div>
  );
}
