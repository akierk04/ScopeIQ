// Tests for the getting-started checklist logic. Run: npm run test:gettingstarted
import assert from "node:assert/strict";
import { computeSteps, STEPS } from "../src/lib/gettingStarted.js";
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log("ok  ", name); } catch (e) { console.error("FAIL", name, "\n    ", e.message); process.exitCode = 1; } };

t("empty workspace: nothing done, settings is next", () => {
  const r = computeSteps({});
  assert.equal(r.doneCount, 0); assert.equal(r.total, STEPS.length); assert.equal(r.nextId, "settings"); assert.equal(r.complete, false);
});
t("settings counts when either name is set, ignores blanks", () => {
  assert.equal(computeSteps({ settings: { vendor_name: "  " } }).steps[0].done, false);
  assert.equal(computeSteps({ settings: { vendor_name: "Acme" } }).steps[0].done, true);
  assert.equal(computeSteps({ settings: { product_name: "Widget" } }).steps[0].done, true);
});
t("next is the first step not done, even if later ones are done", () => {
  const r = computeSteps({ settings: { vendor_name: "A" }, projects: 1, profiles: 1 });
  assert.equal(r.nextId, "model");
  assert.equal(r.steps.find((s) => s.id === "profile").done, true);
});
t("discovery is done by either a finding or an integration", () => {
  assert.equal(computeSteps({ findings: 2 }).steps.find((s) => s.id === "discovery").done, true);
  assert.equal(computeSteps({ integrations: 1 }).steps.find((s) => s.id === "discovery").done, true);
  assert.equal(computeSteps({ findings: 0, integrations: 0 }).steps.find((s) => s.id === "discovery").done, false);
});
t("mappings step needs a CONFIRMED mapping, not just a profile", () => {
  const r = computeSteps({ profiles: 1, confirmedMappings: 0 });
  assert.equal(r.steps.find((s) => s.id === "profile").done, true);
  assert.equal(r.steps.find((s) => s.id === "mappings").done, false);
});
t("all done: complete, no next", () => {
  const r = computeSteps({ settings: { vendor_name: "A" }, models: 1, projects: 1, findings: 1, profiles: 1, confirmedMappings: 3, dataSpecEntities: 2 });
  assert.equal(r.complete, true); assert.equal(r.nextId, null); assert.equal(r.doneCount, r.total);
});
t("bad inputs do not throw or count as done", () => {
  const r = computeSteps({ models: "abc", projects: null, findings: undefined, settings: null });
  assert.equal(r.doneCount, 0);
});
t("every step has an action", () => {
  for (const s of STEPS) assert.ok(s.action && s.action.label && s.title && s.detail, s.id);
});
console.log(`\n${passed} passed`);
