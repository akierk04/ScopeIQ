# PMO Console

Portfolio tracker, risk log, SOW generator, and workflow builder. React + Vite frontend on GitHub Pages, Supabase Postgres for data, a Supabase Edge Function holding your Anthropic key for AI-assist, Supabase Auth as a login gate.

## 1. Supabase project setup

1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/schema_v2.sql`. This creates the normalized schema (projects, milestones, dependencies, risks, scope_items, change_requests, blueprints, blueprint_phases, closeouts) and locks it down with RLS to authenticated users only. (`schema.sql` is the old v1 layout — kept only for reference, don't run it.)
3. Authentication → Providers → make sure Email is enabled.
4. Authentication → Users → **Add user** → create your one account (email + password). There's no public signup screen in this app on purpose — you are the only user.
5. Project Settings → API → copy the **Project URL** and **anon public key**. These go in `.env.local` for local dev and as GitHub repo secrets for deploy.

## 2. Edge Function (AI proxy)

This holds your real Anthropic API key server-side. Nothing in the browser ever sees it.

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy ai-proxy
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-real-key
```

The function also needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` at runtime — Supabase injects these automatically for Edge Functions in your project, you don't set them manually.

## 3. Local development

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 4. Deploy to GitHub Pages

1. Push this repo to GitHub, e.g. `github.com/<you>/pmo-console`.
2. Repo Settings → Pages → Source → **GitHub Actions**.
3. Repo Settings → Secrets and variables → Actions → add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys automatically.
5. If your repo name isn't `pmo-console`, update the `base` path in `vite.config.js` to match — GitHub Pages serves project sites from `/repo-name/`, and a mismatched base means blank pages and broken asset paths.
6. Live at `https://<you>.github.io/pmo-console/`.

## Security notes, read before you put real customer data in this

- The anon key is meant to be public (it's what ships in your JS bundle) — access control comes entirely from the RLS policies in `schema.sql` and the login gate, not from hiding that key.
- RLS policies here allow *any* authenticated user full access to all rows. That's fine for a single-user tool. If you ever add a second user, they'd see everything — there's no per-user data isolation built in.
- The Edge Function checks that the caller has a valid Supabase session before calling Anthropic. It does **not** rate-limit. If your login credentials leak, someone could run your Anthropic bill up, not just read your data.
- `VITE_SUPABASE_ANON_KEY` in GitHub Actions secrets isn't really a secret (it ends up in the public JS bundle regardless) — it's stored as a secret here mainly for convenience, not because exposure matters.

## Product model (v2)

Projects are the hub. Milestones, dependencies, risks, scope items, and change requests all belong to a project and live in its detail view (Portfolio → click a row). There's no more standalone global "Risk log" tab — that was intentional, not an oversight, per the "Projects as core object" redesign.

**System health is a rules-based flag, not a score.** `src/lib/health.js` checks concrete conditions (critical milestone overdue >5 business days, unmitigated High risk, blocking dependency past due, etc.) and shows plain-language reasons — never a fabricated 0–100 number. When the system's read disagrees with your manually-set health, that's a "mismatch," surfaced on the Dashboard and on the project itself. Tune the thresholds in `health.js` as you learn what actually predicts trouble.

**Blueprints** are reusable phase templates (name, owner role, duration, exit criteria, default milestones as week-offsets). "Start project from this" clones the phases into a new project and computes real milestone due dates from the project's start date.

**Closeout** is the estimate-vs-actual capture point, one per project, in the project detail view. It pre-fills what's derivable (schedule variance from dates, scope-change summary from change requests, materialized risks from the risk log) and only asks you for the two things that require human judgment: variance drivers and lessons learned.

## What's NOT built

- No password reset flow (Supabase Auth supports it, this UI doesn't expose it — reset via the Supabase dashboard if you get locked out).
- No offline support. No automated tests.
- SOW estimates are still general professional-services priors, not derived from your closed projects. The Closeout data is the raw material for that eventually — once you have several closed, comparable projects, the natural next step is a "comparable projects" lookup in the SOW generator (show the 2-3 nearest matches and their actual hours/weeks, not a fabricated confidence score). Not built yet — you need actuals in the system first, or there's nothing to compare against.
- Health thresholds in `health.js` are reasonable starting guesses, not calibrated against your actual project outcomes. Revisit them once you've seen a few projects go from Green to Red and can check whether the rules would have caught it earlier.
