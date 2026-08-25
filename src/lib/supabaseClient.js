import { createClient } from "@supabase/supabase-js";

// Same naming convention as BPL Dallas: the client is called `db`, not `supabase`.
// Values come from Vite env vars — set these in .env.local (dev) and as
// repo secrets / build-time env vars for the GitHub Actions deploy.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env.local (dev) or repo secrets (deploy)."
  );
}

export const db = createClient(supabaseUrl, supabaseAnonKey);
