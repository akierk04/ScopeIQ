import { db } from "./supabaseClient";

// This never talks to Anthropic directly. It calls your own Supabase Edge
// Function ("ai-proxy"), which holds the real ANTHROPIC_API_KEY as a server
// secret and forwards the request. The browser never sees that key.
export async function callClaude(prompt, { json = true } = {}) {
  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const { data, error } = await db.functions.invoke("ai-proxy", {
    body: { prompt },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message || "AI request failed");
  const text = data?.text || "";
  if (!json) return text;
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}
