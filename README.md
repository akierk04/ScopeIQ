# PMO Console

Portfolio tracker, risk log, SOW generator, and workflow builder. React + Vite frontend on GitHub Pages, Supabase Postgres for data, a Supabase Edge Function holding your Anthropic key for AI-assist, Supabase Auth as a login gate.

## 1. Supabase project setup

1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/schema_v2.sql`. This creates the normalized schema (projects, milestones, dependencies, risks, scope_items, change_requests, blueprints, blueprint_phases, closeouts) and locks it down with RLS to authenticated users only. (`schema.sql` is the old v1 layout — kept only for reference, don't run it.)
3. Then run `supabase/schema_v3.sql`, then `supabase/schema_v4.sql`, then `supabase/schema_v5.sql`, then `supabase/schema_v6.sql`, then **`supabase/schema_v7.sql`** (adds real multi-tenant isolation AND the Data Model tables — read the next section before running this one, it changes who can see what). There is no schema_v8: the Data Model tables were merged into v7 so it is one SQL run. — adds `roles` (rate card), `change_orders`, `app_settings`, and extends `sows` with the fields the rebuilt SOW generator needs (objectives, in/out of scope, customer responsibilities, mode).
4. First thing in the app: Settings (top right) → set your vendor name and product name. These appear on every generated SOW/Change Order. Then Rate Card tab → add your resource roles and hourly rates before generating anything — the generator refuses to run with zero roles, since there'd be nothing to assign hours to.
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

## Multi-tenant isolation (schema_v7) — do this in order, or you'll lock yourself out of your own data

This is a real rewrite, not an additive feature. Before v7, every table's RLS policy was "any authenticated user sees everything" — fine for a single person, actively dangerous once a second real account exists. v7 moves every table to "only the owner sees their own rows."

**The order matters. Do not skip the data migration.**

1. Run `schema_v7.sql`. This adds an `owner_id` column to every top-level table (Projects, Rate Card, SOWs, Change Orders, SDDs, Blueprints, Data Specification, Discovery findings, Integrations, Settings) and rewrites every RLS policy to check it. The same file then creates the new Data Model tables (section 8), already owner-scoped. Tables that hang off a project (Milestones, Risks, Dependencies, etc.) don't get their own `owner_id` — they inherit isolation through a join to their parent project's owner.
2. **Immediately after running it**, find your own user id: `select id, email from auth.users;` in the SQL Editor.
3. Run the migration block at the bottom of `schema_v7.sql` (section 9, commented out, with `YOUR-USER-ID-HERE` placeholders) substituting your real id — this assigns every one of your existing rows to yourself. Skip this and your own projects become invisible to you, not just hidden from others, because the new RLS policies filter on `owner_id` and your old rows have none.
4. The same migration block makes you an admin (`insert into app_admins ...`). This is what lets you manage the invite allowlist from inside the app instead of SQL.

**Registration is invite-only, not open signup.** The Login screen now has a "Register" toggle, but it checks an `allowed_emails` table before letting anyone sign up — if the email isn't on the list, registration is refused with a clear message. You (as the sole admin until you promote someone else) add emails via **Settings → Invite allowlist**, which only appears if your account is an admin. This exists specifically so your GitHub Pages URL being technically public doesn't mean anyone can register and start spending your Anthropic API quota.

**What's per-user now, with zero sharing:** Projects and everything under them, Rate Card, SOWs, Change Orders, SDDs, Blueprints, Data Specification, Data Models and mappings, Discovery findings and Integrations, and Settings (vendor/product name). Two people can each set a completely different vendor name and nobody sees the other's data.

**What's still shared/global:** the Anthropic API key and the Supabase project itself — every registered user's AI calls still run through your one `ai-proxy` Edge Function and your one Anthropic billing account. Multi-tenancy here means data isolation, not cost isolation — a second user's heavy usage still shows up on your bill. There's no per-user usage tracking or limiting built; if that becomes a real concern, it's a separate piece of work.

## Discovery Review (Evidence Pipeline v1)

New "Discovery" subtab inside each project. Upload a discovery artifact and it's analyzed into two things: seven generic finding types (Requirement, Decision, Assumption, Dependency, TBD, Constraint, Open Question — deliberately kept as seven for now, pending real usage data on whether some should merge), and Integrations, the one object type modeled deeply enough to score.

**Nothing saves automatically.** Extraction proposes; you confirm, edit, or reject each item before it becomes part of the project's approved record. This is a hard rule, not a preference: source → evidence → review → approved, never source → approved directly, because a document can be wrong, stale, or superseded, and the review step is what catches that.

**Definition Score is 100% deterministic — zero AI in the number itself.** It's field-completeness arithmetic against a fixed schema (`src/lib/definitionScore.js`): Essential fields (source system, target system, direction, mechanism, owner) weighted 3, Material (trigger, cadence, mode) weighted 2, Supporting (authentication, data contract, error handling) weighted 1. Score = earned weight ÷ total weight × 100. State is Defined (≥85% AND all Essential present), Partially Defined (60-84%), or Underdefined (below 60%, or any Essential field missing — the AND matters, since a Supporting-heavy object could hit a high percentage while missing something that actually blocks starting work).

**The tiering itself is a judgment call, stated as one** — not derived from data, because there isn't any yet. Once enough completed projects run through Closeout with real hours and variance, that's the point to check whether these weights predict anything and adjust them from evidence instead of guesses. Don't present the score with more confidence than that history currently supports.

**Only Integrations get this treatment in v1, on purpose.** The other six finding types are captured with real provenance (source document + exact excerpt) but no scoring schema yet — building deep field-completeness models for nine object types at once, before knowing whether the pattern even works for one, was the overbuild this version deliberately avoided. Expand to other types once Integration's pattern has been used on real data.

**Provenance is source document name + text excerpt, not page/paragraph numbers.** True page-level citation would require reworking `fileExtract.js` to preserve document structure through extraction, which nothing today does — text gets flattened to a single blob before the AI ever sees it. That's a real, separate piece of work, not a small addition, if it's wanted later.

## Data Specification (formerly "DIOS")

Renamed to Data Specification per product decision — same concept, structured spec of every data flow in/out of an implementation, now genericized with no vendor-specific terminology. Lives inside each project's detail view (not a top-level generator), since it's living structured data curated over the project's life, not a one-shot generated document. Each entity (Customer, Order, Product...) holds its own fields with type, primary-key, nullability, and example values. "Suggest entities from discovery" proposes a starting set from project context plus optional pasted/uploaded material — you review and save before anything's created.


## Data Model and mappings

Two parts: a **Data Model** page (left menu, under Rate Card) and a **Mappings to your Data Model** tab inside Data Specification.

**Data Model** is your own canonical model: entities and fields with a type, required flag, key flag, description and synonyms. Nothing is seeded automatically. On first visit you choose: create the generic starter model (Customer, Contact, Location, Product, Order, Order Line, Invoice, deliberately vendor-neutral), import your own from an .xlsx/.csv (columns Entity, Field, Type, Required, Key, Description, Synonyms), or start blank. Everything is editable and can be exported to .xlsx. Edits save when you leave a field.

**Mappings** (per project) work like this:
1. Upload what the customer sent. Two layouts are detected automatically: a **data file** (header row plus rows) or a **field list** (one row per field, with columns like Field Name and Data Type). You can override the detection.
2. The file is read **in your browser**. Per column, it works out the type, the percentage of empty values and the distinct count. Only those statistics are saved. Row data is never uploaded or stored, and example values are shown on screen but never saved.
3. Columns are matched to your Data Model by fixed rules, no AI: exact name, then synonym, then fuzzy (share of whole-word tokens in common). When a column name exists in several entities (customer_id in Customer and Order), the source sheet's name breaks the tie, and genuinely equal candidates are flagged "Ambiguous". A small built-in abbreviation table (qty, cust, amt, ...) is applied first. Each match records how it was found and whether the source and target types are compatible, convertible or in conflict. There is no made-up confidence number.
4. You confirm, change or reject each mapping. "Confirm exact and synonym matches" does the safe ones in bulk and skips ambiguous matches and type conflicts.
5. Optional: "Ask AI about N unmapped columns". It sends column names and types, plus example values only if you tick the box (and only for files profiled in the current session). Its answers are validated against your model, stored as suggestions marked AI, and need your confirmation like any other.
6. **Coverage** is plain arithmetic: required target fields with at least one *confirmed* mapping, divided by required target fields, over the entities you mark in scope for the project. Unconfirmed suggestions never count. Gaps are listed by name, and quality flags call out type conflicts and required fields fed by columns with many empty values.
7. "Add to Data Specification" turns confirmed mappings into Data Specification entities and fields (source column, target type, key and nullability carried across). It skips anything already there, so repeating it is safe.

**Things that are guesses, not validated:** the fuzzy threshold (0.5) and the "many empty values" flag (20%). Both are adjustable on the page, and the adjustments reset when you leave it.

**Known limits:**
- Inbound only in this version. The schema has a direction column so outbound can come later without a migration.
- Only .xlsx and .csv. Row cap of 200,000 per sheet, distinct counts stop at 50,000. Both are untested guesses at what a browser tab handles; very large files may be slow.
- Character-level typo matching is deliberately not used. In testing it matched contract_id to contact_id. Typos and anything else the rules miss are left to the optional AI step.
- Deleting a source file deletes the mappings made from it. Deleting a Data Model entity or field deletes the mappings that point at it, in every project.
- The `xlsx` package still carries the npm advisories noted earlier. It runs only on files you choose to open on your own computer.
- Ambiguity hints are recomputed from the rules each time the page loads, so they reflect your current synonyms.

**Tests:** `npm run test:datamodel` runs 21 checks on the profiling, matching, coverage and import/export logic. Set `SAMPLE_DIR` to the folder holding `sample_data_mapping.xlsx` and `sample_data_mapping_2.xlsx` to include the two sample-file checks.

## Solution Design Document (SDD)

A generated document, same pattern as SOW/Change Orders — link a SOW (recommended, carries scope into the design) and/or paste or upload discovery context, generate a draft (overview, benefits, objectives, in/out of scope, assumptions, risks, architecture overview, and per-module requirements + acceptance criteria), review, save, export to markdown. Draft/Approved/Rejected status, same as SOWs.

## File upload (PDF, DOCX, XLSX, images)

Available on SOW generation, SDD generation, and Data Specification suggestion. PDF and DOCX text extraction and XLSX sheet extraction all run entirely client-side (pdf.js, mammoth, SheetJS) — nothing is uploaded to any server just to read it. Images go straight to Claude's vision via the existing AI proxy rather than a separate OCR step. A safety net truncates anything over ~40,000 characters with a visible warning rather than silently working from a clipped document. Scanned PDFs (no real text layer) and legacy `.doc`/`.xls` formats aren't supported — clear errors explain why rather than failing silently.

**Note on the `xlsx` npm package specifically:** it carries known vulnerability advisories (the SheetJS project recommends installing their patched build directly from their own CDN rather than npm for production use). This is fine for the intended use here — you parsing your own discovery documents — but if this tool ever accepts uploads from people you don't trust, revisit this before that happens.

## Contract-before-project flow

A SOW now has a status: Draft, Approved, or Rejected. "Create project from this SOW" only appears once a SOW is Approved — this is deliberate, not a missing feature elsewhere. The new project inherits vertical and estimated duration (target date = start date + the SOW's estimated weeks) from the SOW; you fill in what the SOW doesn't capture (account, owner, actual start date). The project's Overview tab shows which SOW it came from. A project can still be created without a SOW (Blueprints, or Portfolio → New project) — this doesn't force every project through a SOW, it just makes the SOW-to-project path real when you use it.

## SOW / Change Order generation model

The AI never invents dollar amounts. It proposes **hours per role**, chosen from the roles you've defined in the Rate Card; the app multiplies by your stored hourly rate to get cost. If you change a rate later, saved SOWs keep the hours they were built with, but re-open the export and the cost recalculates from whatever the rate card says *now* — it's not frozen at generation time. If that's not what you want for a specific past estimate, note the rate at the time in that SOW's narrative.

Legal boilerplate (liability caps, indemnity, confidentiality, payment-term enforcement language) is deliberately **not generated**. The templates only produce scope, objectives, assumptions, customer responsibilities, and resourcing/fees. Anything with real legal weight needs a human — pull it in from a reviewed template separately, don't let the model draft it.

## What's NOT built

- No password reset flow (Supabase Auth supports it, this UI doesn't expose it — reset via the Supabase dashboard if you get locked out).
- No offline support. No automated tests.
- SOW estimates are still general professional-services priors, not derived from your closed projects. The Closeout data is the raw material for that eventually — once you have several closed, comparable projects, the natural next step is a "comparable projects" lookup in the SOW generator (show the 2-3 nearest matches and their actual hours/weeks, not a fabricated confidence score). Not built yet — you need actuals in the system first, or there's nothing to compare against.
- Health thresholds in `health.js` are reasonable starting guesses, not calibrated against your actual project outcomes. Revisit them once you've seen a few projects go from Green to Red and can check whether the rules would have caught it earlier.
