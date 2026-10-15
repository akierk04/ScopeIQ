// Sanity tests for the deterministic Data Model logic (profile, match, coverage, modelIO).
// Run: npm run test:datamodel   (set SAMPLE_DIR to also run the sample-spreadsheet checks)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { classifyValue, resolveColumnType, profileRows, profileWorkbookBuffer, normalizeTypeLabel } from "../src/lib/profile.js";
import { tokenize, normalizeName, typeCheck, autoMatch, DEFAULT_THRESHOLDS } from "../src/lib/match.js";
import { computeCoverage } from "../src/lib/coverage.js";
import { STARTER_MODEL } from "../src/lib/starterModel.js";
import { modelToRows, rowsToModel } from "../src/lib/modelIO.js";

let passed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log("ok  ", name); } catch (e) { console.error("FAIL", name, "\n    ", e.message); process.exitCode = 1; } };

// ---- build the starter model in the shape the app uses ----
const model = { entities: [], fields: [] };
STARTER_MODEL.entities.forEach((e, ei) => {
  const id = "e" + ei;
  model.entities.push({ id, name: e.name });
  e.fields.forEach((f, fi) => model.fields.push({ id: `${id}f${fi}`, entityId: id, name: f[0], dataType: f[1], required: f[2], isKey: f[3], description: f[4], synonyms: f[5] }));
});
const F = (entity, field) => model.fields.find((f) => model.entities.find((e) => e.id === f.entityId).name === entity && f.name === field);

// ---- classify / profile ----
t("classifyValue basics", () => {
  assert.equal(classifyValue(5), "integer");
  assert.equal(classifyValue(5.5), "decimal");
  assert.equal(classifyValue("42"), "integer");
  assert.equal(classifyValue("0042"), "string", "leading zeros are identifiers");
  assert.equal(classifyValue("1,234.50"), "decimal");
  assert.equal(classifyValue("2026-03-14"), "date");
  assert.equal(classifyValue("2026-03-14T10:30:00Z"), "datetime");
  assert.equal(classifyValue("3/14/2026"), "date");
  assert.equal(classifyValue("Yes"), "boolean");
  assert.equal(classifyValue(new Date(Date.UTC(2026, 2, 14))), "date");
  assert.equal(classifyValue(new Date(Date.UTC(2026, 2, 14, 9, 30))), "datetime");
  assert.equal(classifyValue("CUST-10432"), "string");
});
t("resolveColumnType widening", () => {
  assert.equal(resolveColumnType({ integer: 3, decimal: 1 }), "decimal");
  assert.equal(resolveColumnType({ date: 2, datetime: 1 }), "datetime");
  assert.equal(resolveColumnType({ integer: 3, string: 1 }), "string");
  assert.equal(resolveColumnType({ integer: 3, boolean: 1 }), "string");
});
t("profileRows stats", () => {
  const rows = [
    ["id", "amount", "note", "empty_col"],
    ["A1", 10, "x", null],
    ["A2", 12.5, "", null],
    ["A3", null, null, null],
    ["A1", 7, "y", null],
  ];
  const p = profileRows(rows);
  assert.equal(p.rowCount, 4);
  const by = Object.fromEntries(p.columns.map((c) => [c.name, c]));
  assert.equal(by.id.inferredType, "string");
  assert.equal(by.id.distinctCount, 3);
  assert.equal(by.amount.inferredType, "decimal");
  assert.equal(by.amount.nullPct, 25);
  assert.equal(by.note.nullPct, 50);
  assert.equal(by.empty_col.allEmpty, true);
});
t("profileRows caps rows and flags truncation", () => {
  const rows = [["a"], ...Array.from({ length: 50 }, (_, i) => [i])];
  const p = profileRows(rows, { maxRows: 10 });
  assert.equal(p.rowCount, 10);
  assert.equal(p.truncated, true);
});
t("normalizeTypeLabel", () => {
  assert.equal(normalizeTypeLabel("VARCHAR(50)"), "string");
  assert.equal(normalizeTypeLabel("Number"), "decimal");
  assert.equal(normalizeTypeLabel("Timestamp"), "datetime");
  assert.equal(normalizeTypeLabel("blob"), null);
});

// ---- data-mode workbook ----
t("profileWorkbookBuffer, data mode with real Date cells", () => {
  const wb = XLSX.utils.book_new();
  const aoa = [["order_id", "order_date", "qty", "unit_price"], ["O1", new Date(Date.UTC(2026, 0, 5)), 3, 1.5], ["O2", new Date(Date.UTC(2026, 0, 6)), 4, null], ["O3", new Date(Date.UTC(2026, 0, 7)), 5, null]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "Order");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
  const res = profileWorkbookBuffer(buf);
  assert.equal(res.mode, "data");
  const by = Object.fromEntries(res.sheets[0].columns.map((c) => [c.name, c]));
  assert.equal(by.order_date.inferredType, "date");
  assert.equal(by.qty.inferredType, "integer");
  assert.equal(by.unit_price.inferredType, "decimal");
  assert.ok(Math.abs(by.unit_price.nullPct - 66.7) < 0.1);
});
t("profileWorkbookBuffer reads csv", () => {
  const csv = "customer_id,region\nC1,East\nC2,\nC3,West\n";
  const res = profileWorkbookBuffer(new TextEncoder().encode(csv));
  assert.equal(res.sheets[0].columns.length, 2);
  assert.ok(Math.abs(res.sheets[0].columns[1].nullPct - 33.3) < 0.1);
});

// ---- name normalization / types ----
t("tokenize and normalize", () => {
  assert.deepEqual(tokenize("CustomerID"), ["customer", "id"]);
  assert.equal(normalizeName("Qty_Ordered"), "quantity ordered");
  assert.equal(normalizeName("PRODUCT-SKU"), "product sku");
  assert.equal(normalizeName("Order Lines"), "order line");
});
t("typeCheck matrix", () => {
  assert.equal(typeCheck("integer", "decimal"), "compatible");
  assert.equal(typeCheck("decimal", "integer"), "convertible");
  assert.equal(typeCheck("string", "date"), "convertible");
  assert.equal(typeCheck("date", "decimal"), "conflict");
  assert.equal(typeCheck("boolean", "date"), "conflict");
  assert.equal(typeCheck(null, "string"), "unknown");
});

// ---- matching ----
const run = (sheetName, cols) => {
  const res = autoMatch(cols.map(([name, type]) => ({ key: `${sheetName}.${name}`, name, sheetName, inferredType: type })), model);
  return Object.fromEntries(res.map((r) => [r.key.split(".")[1], r]));
};
t("exact + sheet affinity: Order.customer_id maps to Order, not Customer", () => {
  const r = run("Order", [["order_id", "string"], ["customer_id", "string"], ["order_date", "date"], ["quantity", "decimal"], ["unit_price", "decimal"], ["sku", "string"]]);
  assert.equal(r.order_id.targetFieldId, F("Order", "order_id").id);
  assert.equal(r.order_id.method, "exact");
  assert.equal(r.customer_id.targetFieldId, F("Order", "customer_id").id);
  assert.equal(r.order_date.targetFieldId, F("Order", "order_date").id);
  assert.equal(r.quantity.targetFieldId, F("Order Line", "quantity").id);
  assert.equal(r.unit_price.targetFieldId, F("Order Line", "unit_price").id);
  assert.equal(r.sku.method, "synonym");
  assert.equal(r.sku.targetFieldId, F("Order Line", "product_id").id);
});
t("Customer sheet", () => {
  const r = run("Customer", [["customer_id", "string"], ["customer_name", "string"], ["channel", "string"], ["region", "string"], ["credit_status", "string"]]);
  assert.equal(r.customer_id.targetFieldId, F("Customer", "customer_id").id);
  assert.equal(r.customer_name.targetFieldId, F("Customer", "customer_name").id);
  assert.equal(r.channel.method, "synonym");
  assert.equal(r.channel.targetFieldId, F("Customer", "customer_type").id);
  assert.equal(r.region.targetFieldId, F("Customer", "region").id);
  assert.equal(r.credit_status.targetFieldId, F("Customer", "status").id);
});
t("ambiguity is flagged when the sheet gives no hint", () => {
  const r = run("Contract", [["product_sku", "string"]]);
  assert.equal(r.product_sku.method, "synonym");
  assert.equal(r.product_sku.ambiguous, true);
});
t("unrelated columns stay unmatched; fuzzy kicks in for partial names", () => {
  const r = run("Shipment", [["quantity_shipped", "decimal"], ["volume_tier_threshold", "decimal"], ["xyzzy_flag", "string"]]);
  assert.equal(r.quantity_shipped.method, "fuzzy");
  assert.equal(r.volume_tier_threshold.targetFieldId, null);
  assert.equal(r.xyzzy_flag.targetFieldId, null);
});
t("type check is attached to matches", () => {
  const r = run("Order", [["order_date", "string"], ["quantity", "date"]]);
  assert.equal(r.order_date.typeCheck, "convertible");
  assert.equal(r.quantity.typeCheck, "conflict");
});
t("one-letter-apart different words are not fuzzy matched (contract_id vs contact_id)", () => {
  const r = run("Contract", [["contract_id", "string"]]);
  assert.equal(r.contract_id.targetFieldId, null);
});
t("thresholds are honoured", () => {
  const strict = autoMatch([{ key: "k", name: "quantity_shipped", sheetName: "Shipment", inferredType: "decimal" }], model, { fuzzyJaccard: 0.9 });
  assert.equal(strict[0].targetFieldId, null);
});

// ---- coverage ----
t("coverage counts only confirmed mappings, over in-scope entities", () => {
  const cust = model.entities.find((e) => e.name === "Customer").id;
  const prod = model.entities.find((e) => e.name === "Product").id;
  const reqCust = model.fields.filter((f) => f.entityId === cust && f.required); // customer_id, customer_name
  assert.equal(reqCust.length, 2);
  const cols = { c1: { name: "customer_id", sheetName: "Customer", nullPct: 0 }, c2: { name: "customer_name", sheetName: "Customer", nullPct: 35 }, c3: { name: "x", sheetName: "Customer", nullPct: 0 } };
  const mappings = [
    { id: "m1", sourceColumnId: "c1", targetFieldId: F("Customer", "customer_id").id, status: "confirmed", typeCheck: "compatible" },
    { id: "m2", sourceColumnId: "c2", targetFieldId: F("Customer", "customer_name").id, status: "suggested", typeCheck: "compatible" },
    { id: "m3", sourceColumnId: "c3", targetFieldId: F("Customer", "region").id, status: "confirmed", typeCheck: "conflict" },
  ];
  let cov = computeCoverage({ model, scopeEntityIds: [cust, prod], mappings, columnsById: cols });
  assert.equal(cov.overall.requiredTotal, 4); // 2 customer + 2 product
  assert.equal(cov.overall.requiredMapped, 1);
  assert.equal(cov.overall.pct, 25);
  assert.equal(cov.suggestedPending, 1);
  assert.ok(cov.gaps.some((g) => g.entityName === "Product" && g.fieldName === "product_id"));
  assert.ok(cov.flags.some((f) => f.kind === "type_conflict"));
  // confirming m2 pushes coverage up and raises a high-null flag (35% > 20%)
  mappings[1].status = "confirmed";
  cov = computeCoverage({ model, scopeEntityIds: [cust, prod], mappings, columnsById: cols });
  assert.equal(cov.overall.requiredMapped, 2);
  assert.ok(cov.flags.some((f) => f.kind === "high_nulls"));
  // entity out of scope does not count
  cov = computeCoverage({ model, scopeEntityIds: [cust], mappings, columnsById: cols });
  assert.equal(cov.overall.pct, 100);
});

// ---- model import/export ----
t("model rows round-trip", () => {
  const shaped = { name: "x", entities: STARTER_MODEL.entities.map((e) => ({ name: e.name, fields: e.fields.map((f) => ({ name: f[0], dataType: f[1], required: f[2], isKey: f[3], description: f[4], synonyms: f[5] })) })) };
  const back = rowsToModel(modelToRows(shaped));
  assert.equal(back.entities.length, shaped.entities.length);
  assert.equal(back.entities[0].fields.length, shaped.entities[0].fields.length);
  assert.deepEqual(back.entities[4].fields[0].synonyms, shaped.entities[4].fields[0].synonyms);
  assert.equal(back.warnings.length, 0);
});
t("model import rejects files without Entity/Field columns", () => {
  assert.throws(() => rowsToModel([["a", "b"], [1, 2]]));
});

// ---- optional: the real sample spreadsheets ----
const dir = process.env.SAMPLE_DIR;
if (dir && fs.existsSync(path.join(dir, "sample_data_mapping.xlsx"))) {
  t("sample spreadsheet is detected as field-list and matches well", () => {
    const buf = fs.readFileSync(path.join(dir, "sample_data_mapping.xlsx"));
    const res = profileWorkbookBuffer(buf);
    assert.equal(res.mode, "field_list");
    assert.deepEqual(res.sheets.map((s) => s.sheetName), ["Customer", "Order"]);
    const cols = res.sheets.flatMap((s) => s.columns.map((c) => ({ key: `${s.sheetName}.${c.name}`, name: c.name, sheetName: s.sheetName, inferredType: c.inferredType })));
    assert.equal(cols.length, 11);
    const m = autoMatch(cols, model);
    const matched = m.filter((x) => x.targetFieldId).length;
    console.log(`     sample 1: ${matched}/${cols.length} columns matched (${m.map((x) => x.method || "-").join(",")})`);
    assert.ok(matched >= 10);
  });
  t("second sample: honest about what a generic model can't match", () => {
    const buf = fs.readFileSync(path.join(dir, "sample_data_mapping_2.xlsx"));
    const res = profileWorkbookBuffer(buf);
    const cols = res.sheets.flatMap((s) => s.columns.map((c) => ({ key: `${s.sheetName}.${c.name}`, name: c.name, sheetName: s.sheetName, inferredType: c.inferredType })));
    const m = autoMatch(cols, model);
    const unmatched = cols.filter((c, i) => !m[i].targetFieldId).map((c) => c.key);
    console.log(`     sample 2: ${cols.length - unmatched.length}/${cols.length} matched; unmatched: ${unmatched.join(", ")}`);
    assert.ok(unmatched.includes("Contract.contract_id")); // the starter model has no Contract entity
  });
}

console.log(`\n${passed} checks passed${process.exitCode ? ", with failures" : ""}.`);
