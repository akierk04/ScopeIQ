import * as XLSX from "xlsx";
import { DATA_TYPES, normalizeTypeLabel } from "./profile.js";

// Import / export of a target model as a flat table:
//   Entity | Field | Type | Required | Key | Description | Synonyms (semicolon-separated)
// Rows with the same Entity are grouped. Entity-level descriptions are not part
// of this format.

export const MODEL_HEADERS = ["Entity", "Field", "Type", "Required", "Key", "Description", "Synonyms"];

const truthy = (v) => /^(y|yes|true|1|required|x)/i.test(String(v ?? "").trim());

// model: { name, entities:[{name, fields:[{name,dataType,required,isKey,description,synonyms}]}] }
export function modelToRows(model) {
  const rows = [MODEL_HEADERS];
  for (const e of model.entities) {
    for (const f of e.fields) {
      rows.push([e.name, f.name, f.dataType, f.required ? "Yes" : "No", f.isKey ? "Yes" : "No", f.description || "", (f.synonyms || []).join("; ")]);
    }
  }
  return rows;
}

export function exportModelXlsx(model, filename) {
  const ws = XLSX.utils.aoa_to_sheet(modelToRows(model));
  ws["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 44 }, { wch: 44 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data Model");
  XLSX.writeFile(wb, filename || "data_model.xlsx");
}

// Returns { entities:[{name, fields:[...]}], warnings:[string] }
export function rowsToModel(rows2d) {
  const warnings = [];
  const headerIdx = rows2d.findIndex((r) => r && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""));
  if (headerIdx === -1) throw new Error("The file is empty.");
  const header = rows2d[headerIdx].map((c) => String(c ?? "").toLowerCase().trim());
  const col = (re) => header.findIndex((h) => re.test(h));
  const iEntity = col(/^entity|^table|^object/);
  const iField = col(/^field|^column|^attribute/);
  if (iEntity === -1 || iField === -1) throw new Error('Expected columns named "Entity" and "Field". Optional: Type, Required, Key, Description, Synonyms.');
  const iType = col(/^(data\s*)?type/);
  const iReq = col(/^required|^mandatory/);
  const iKey = col(/^key|^primary/);
  const iDesc = col(/^desc/);
  const iSyn = col(/^synonym|^alias/);

  const byName = new Map();
  rows2d.slice(headerIdx + 1).forEach((r, idx) => {
    if (!r) return;
    const en = String(r[iEntity] ?? "").trim();
    const fn = String(r[iField] ?? "").trim();
    if (!en || !fn) return;
    if (!byName.has(en)) byName.set(en, { name: en, description: "", fields: [] });
    let dataType = iType === -1 ? "string" : normalizeTypeLabel(r[iType]);
    if (!dataType || !DATA_TYPES.includes(dataType)) {
      if (iType !== -1 && String(r[iType] ?? "").trim()) warnings.push(`Row ${headerIdx + idx + 2}: unknown type "${r[iType]}" for ${en}.${fn}, using string.`);
      dataType = "string";
    }
    const ent = byName.get(en);
    if (ent.fields.some((f) => f.name.toLowerCase() === fn.toLowerCase())) {
      warnings.push(`Row ${headerIdx + idx + 2}: duplicate field ${en}.${fn} skipped.`);
      return;
    }
    ent.fields.push({
      name: fn,
      dataType,
      required: iReq !== -1 && truthy(r[iReq]),
      isKey: iKey !== -1 && truthy(r[iKey]),
      description: iDesc === -1 ? "" : String(r[iDesc] ?? "").trim(),
      synonyms: iSyn === -1 ? [] : String(r[iSyn] ?? "").split(/[;,]/).map((s) => s.trim()).filter(Boolean),
    });
  });
  const entities = [...byName.values()];
  if (!entities.length) throw new Error("No entity/field rows found.");
  return { entities, warnings };
}

export async function importModelFile(file) {
  const name = file.name.toLowerCase();
  if (!(name.endsWith(".xlsx") || name.endsWith(".csv"))) throw new Error("Import reads .xlsx or .csv.");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  return rowsToModel(rows2d);
}
