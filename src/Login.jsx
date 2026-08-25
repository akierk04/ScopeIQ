import React, { useState } from "react";
import { db } from "./lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={signIn} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h1 className="text-lg font-semibold text-slate-100 mb-1">PMO Console</h1>
        <p className="text-xs text-slate-500 mb-5 font-mono">Sign in to continue</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500/60"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500/60"
        />
        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
        <button
          disabled={busy}
          className="w-full py-2 rounded-md text-sm font-medium bg-teal-500 text-slate-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-xs text-slate-600 mt-4">
          No self-serve signup here on purpose. Create your one account in the Supabase dashboard
          (Authentication → Users → Add user) — see README.
        </p>
      </form>
    </div>
  );
}
