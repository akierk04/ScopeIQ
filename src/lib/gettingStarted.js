// Getting-started checklist logic. Pure and deterministic: given a few facts
// about what exists in the user's own workspace, say which steps are done and
// which one comes next. No AI, nothing here talks to the database.

export const STEPS = [
  {
    id: "settings",
    title: "Name your product",
    detail: "Open Settings (top right) and enter a vendor name and a product name. Any values work.",
    action: { type: "settings", label: "Open Settings" },
  },
  {
    id: "model",
    title: "Create your Data Model",
    detail: "On the Data Model page, click \"Create generic starter model\". This is what customer files get matched against.",
    action: { type: "tab", tab: "datamodel", label: "Go to Data Model" },
  },
  {
    id: "project",
    title: "Create a project",
    detail: "In Portfolio, click New project. Only the name is required.",
    action: { type: "tab", tab: "portfolio", label: "Go to Portfolio" },
  },
  {
    id: "discovery",
    title: "Analyze discovery notes",
    detail: "Open a project, go to its Discovery tab, upload notes, then Confirm the findings and integrations you agree with.",
    action: { type: "project", label: "Open a project" },
  },
  {
    id: "profile",
    title: "Profile a customer data file",
    detail: "In Data Specification, choose a project, open \"Mappings to your Data Model\", tick the entities in scope, then profile an .xlsx or .csv file.",
    action: { type: "tab", tab: "dataspec", label: "Go to Data Specification" },
  },
  {
    id: "mappings",
    title: "Confirm mappings",
    detail: "Review the proposed matches. Confirm the right ones and fix the rest by hand. Suggestions do not count until confirmed.",
    action: { type: "tab", tab: "dataspec", label: "Go to Data Specification" },
  },
  {
    id: "dataspec",
    title: "Add mappings to the Data Specification",
    detail: "Use \"Add all\" under \"Add confirmed mappings to the Data Specification\", then check the Entities and fields tab.",
    action: { type: "tab", tab: "dataspec", label: "Go to Data Specification" },
  },
];

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// facts: { settings, projects, models, findings, integrations, profiles, confirmedMappings, dataSpecEntities }
// settings is an object; the others are counts (numbers). Missing values count as 0.
export function computeSteps(facts = {}) {
  const n = (k) => Number(facts[k]) || 0;
  const s = facts.settings || {};
  const done = {
    settings: filled(s.vendor_name) || filled(s.product_name),
    model: n("models") > 0,
    project: n("projects") > 0,
    discovery: n("findings") + n("integrations") > 0,
    profile: n("profiles") > 0,
    mappings: n("confirmedMappings") > 0,
    dataspec: n("dataSpecEntities") > 0,
  };
  const steps = STEPS.map((st) => ({ ...st, done: !!done[st.id] }));
  const nextIndex = steps.findIndex((st) => !st.done);
  return {
    steps,
    doneCount: steps.filter((st) => st.done).length,
    total: steps.length,
    nextId: nextIndex === -1 ? null : steps[nextIndex].id,
    complete: nextIndex === -1,
  };
}
