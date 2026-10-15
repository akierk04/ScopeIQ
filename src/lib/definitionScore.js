// Definition Score for an Integration — deterministic, zero AI involvement.
// Tiering below is a judgment call (which fields block starting work vs. which
// get finalized mid-build), not a statistically derived weighting. Revisit
// once enough completed projects exist to check whether it actually predicts
// anything; until then, treat it as an inspectable rule, not a trained model.

const ESSENTIAL_FIELDS = ["sourceSystem", "targetSystem", "direction", "mechanism", "owner"];
const MATERIAL_FIELDS = ["trigger", "cadence", "mode"];
const SUPPORTING_FIELDS = ["authentication", "dataContract", "errorHandling"];

const WEIGHT = { essential: 3, material: 2, supporting: 1 };
const TOTAL_WEIGHT =
  ESSENTIAL_FIELDS.length * WEIGHT.essential +
  MATERIAL_FIELDS.length * WEIGHT.material +
  SUPPORTING_FIELDS.length * WEIGHT.supporting;

const isFilled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

export function scoreIntegration(integration) {
  let earned = 0;
  const missingEssential = [];
  const missingOther = [];

  for (const f of ESSENTIAL_FIELDS) {
    if (isFilled(integration[f])) earned += WEIGHT.essential;
    else missingEssential.push(f);
  }
  for (const f of MATERIAL_FIELDS) {
    if (isFilled(integration[f])) earned += WEIGHT.material;
    else missingOther.push(f);
  }
  for (const f of SUPPORTING_FIELDS) {
    if (isFilled(integration[f])) earned += WEIGHT.supporting;
    else missingOther.push(f);
  }

  const score = Math.round((earned / TOTAL_WEIGHT) * 100);
  let state;
  if (missingEssential.length > 0) state = "Underdefined";
  else if (score >= 85) state = "Defined";
  else if (score >= 60) state = "Partially Defined";
  else state = "Underdefined";

  return { score, state, missingEssential, missingOther };
}

export { ESSENTIAL_FIELDS, MATERIAL_FIELDS, SUPPORTING_FIELDS };
