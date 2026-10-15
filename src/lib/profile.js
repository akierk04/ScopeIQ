import * as XLSX from "xlsx";

// Browser-side profiling of a source file. Nothing here talks to a server and
// nothing here is AI. The only things that ever leave the browser are the
// per-column statistics the caller chooses to save (type, null %, distinct
// count). Row data and sample values are never persisted.

export const DATA_TYPES = ["string", "integer", "decimal", "date", "datetime", "boolean"];

// Safety caps. Both are untested guesses at what a browser tab handles
// comfortably, not measured limits.
export const MAX_ROWS = 200000;
export const MAX_DISTINCT = 50000;

const isEmpty = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const RE_INT = /^[-+]?(0|[1-9]\d*)$/;
const RE_DEC = /^[-+]?(\d+\.\d+|\.\d+|\d{1,3}(,\d{3})+(\.\d+)?)$/;
const RE_DATE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/;
const RE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const BOOL_WORDS = new Set(["true", "false", "yes", "no", "y", "n"]);

// Classify one non-empty cell value.
export function classifyValue(v) {
  if (v instanceof Date) {
    const hasTime = v.getUTCHours() !== 0 || v.getUTCMinutes() !== 0 || v.getUTCSeconds() !== 0;
    return hasTime ? "datetime" : "date";
  }
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "decimal";
  const s = String(v).trim();
  if (BOOL_WORDS.has(s.toLowerCase())) return "boolean";
  // Leading zeros ("00123") are identifiers, not numbers.
  if (RE_INT.test(s)) return "integer";
  if (RE_DEC.test(s)) return "decimal";
  if (RE_DATETIME.test(s)) return "datetime";
  if (RE_DATE.test(s)) return "date";
  return "string";
}

// Combine per-value classes into one column type. Unanimous wins; integer+decimal
// widens to decimal; date+datetime widens to datetime; anything else is string.
export function resolveColumnType(counts) {
  const kinds = Object.keys(counts).filter((k) => counts[k] > 0);
  if (kinds.length === 0) return "string";
  if (kinds.length === 1) return kinds[0];
  if (kinds.every((k) => k === "integer" || k === "decimal")) return "decimal";
  if (kinds.every((k) => k === "date" || k === "datetime")) return "datetime";
  // Any other mixture (including a stray "y"/"n" among numbers) is treated as string.
  return "string";
}

// rows2d: array of arrays, first non-empty row is the header.
export function profileRows(rows2d, { maxRows = MAX_ROWS, maxDistinct = MAX_DISTINCT, sampleSize = 5 } = {}) {
  const headerIdx = rows2d.findIndex((r) => r && r.some((c) => !isEmpty(c)));
  if (headerIdx === -1) return { columns: [], rowCount: 0, truncated: false };
  const header = rows2d[headerIdx].map((c) => (isEmpty(c) ? "" : String(c).trim()));
  const body = rows2d.slice(headerIdx + 1).filter((r) => r && r.some((c) => !isEmpty(c)));
  const truncated = body.length > maxRows;
  const used = truncated ? body.slice(0, maxRows) : body;

  const columns = [];
  header.forEach((name, ci) => {
    if (!name) return; // unnamed column: skip
    const counts = {};
    const distinct = new Set();
    let capped = false;
    let nulls = 0;
    const samples = [];
    for (const row of used) {
      const v = row[ci];
      if (isEmpty(v)) { nulls++; continue; }
      const k = classifyValue(v);
      counts[k] = (counts[k] || 0) + 1;
      if (!capped) {
        const key = v instanceof Date ? v.toISOString() : String(v).trim();
        distinct.add(key);
        if (distinct.size >= maxDistinct) capped = true;
        if (samples.length < sampleSize && !samples.includes(key)) samples.push(key);
      }
    }
    const total = used.length;
    columns.push({
      name,
      inferredType: total === nulls ? "string" : resolveColumnType(counts),
      nullPct: total ? Math.round((nulls / total) * 1000) / 10 : null,
      distinctCount: distinct.size,
      distinctCapped: capped,
      declaredRequired: null,
      allEmpty: total > 0 && nulls === total,
      // In memory only. Never saved. Used for the review screen and, if the user
      // ticks the box, as extra context for an AI suggestion.
      samples,
    });
  });
  return { columns, rowCount: used.length, truncated };
}

// ---------- Field-list mode ----------
// Many mapping spreadsheets describe fields (one row per field) instead of
// containing data. Detect those and read the names/types straight off the rows.

const TYPE_ALIASES = {
  string: "string", text: "string", varchar: "string", char: "string", nvarchar: "string", str: "string", uuid: "string", guid: "string",
  integer: "integer", int: "integer", long: "integer", bigint: "integer", smallint: "integer", whole: "integer",
  decimal: "decimal", number: "decimal", numeric: "decimal", float: "decimal", double: "decimal", real: "decimal", money: "decimal", currency: "decimal",
  date: "date",
  datetime: "datetime", timestamp: "datetime", "date time": "datetime",
  boolean: "boolean", bool: "boolean", bit: "boolean", flag: "boolean",
};

export function normalizeTypeLabel(label) {
  if (isEmpty(label)) return null;
  const s = String(label).toLowerCase().replace(/\(.*\)/, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (TYPE_ALIASES[s]) return TYPE_ALIASES[s];
  const first = s.split(" ")[0];
  return TYPE_ALIASES[first] || null;
}

const headerHas = (header, re) => header.findIndex((h) => re.test(h));

export function looksLikeFieldList(rows2d) {
  const headerIdx = rows2d.findIndex((r) => r && r.some((c) => !isEmpty(c)));
  if (headerIdx === -1) return false;
  const header = rows2d[headerIdx].map((c) => String(c ?? "").toLowerCase().trim());
  const nameCol = headerHas(header, /^(field|column|attribute)(\s*name)?$/);
  const typeCol = headerHas(header, /^(data\s*)?type$/);
  return nameCol !== -1 && typeCol !== -1;
}

export function profileFieldList(rows2d) {
  const headerIdx = rows2d.findIndex((r) => r && r.some((c) => !isEmpty(c)));
  if (headerIdx === -1) return { columns: [], rowCount: 0, truncated: false };
  const header = rows2d[headerIdx].map((c) => String(c ?? "").toLowerCase().trim());
  const nameCol = headerHas(header, /^(field|column|attribute)(\s*name)?$/);
  const typeCol = headerHas(header, /^(data\s*)?type$/);
  const reqCol = headerHas(header, /^(required|mandatory)\??$/);
  const exCol = headerHas(header, /^example/);
  const columns = [];
  for (const row of rows2d.slice(headerIdx + 1)) {
    if (!row || isEmpty(row[nameCol])) continue;
    const req = reqCol === -1 || isEmpty(row[reqCol]) ? null : /^(y|yes|true|1|required)/i.test(String(row[reqCol]).trim());
    columns.push({
      name: String(row[nameCol]).trim(),
      inferredType: normalizeTypeLabel(row[typeCol]) || "string",
      nullPct: null,
      distinctCount: null,
      distinctCapped: false,
      declaredRequired: req,
      allEmpty: false,
      samples: exCol !== -1 && !isEmpty(row[exCol]) ? [String(row[exCol]).trim()] : [],
    });
  }
  return { columns, rowCount: 0, truncated: false };
}

// ---------- Workbook entry points ----------

// buffer: ArrayBuffer / Uint8Array. mode: "auto" | "data" | "field_list".
export function profileWorkbookBuffer(buffer, { mode = "auto", maxRows, maxDistinct } = {}) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets = [];
  let detectedMode = null;
  let truncated = false;
  let totalRows = 0;
  for (const sheetName of wb.SheetNames) {
    const rows2d = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    if (!rows2d.length) continue;
    const sheetMode = mode === "auto" ? (looksLikeFieldList(rows2d) ? "field_list" : "data") : mode;
    const res = sheetMode === "field_list" ? profileFieldList(rows2d) : profileRows(rows2d, { maxRows, maxDistinct });
    if (!res.columns.length) continue;
    sheets.push({ sheetName, mode: sheetMode, ...res });
    detectedMode = detectedMode === null ? sheetMode : detectedMode === sheetMode ? sheetMode : "mixed";
    truncated = truncated || res.truncated;
    totalRows += res.rowCount;
  }
  if (!sheets.length) throw new Error("No readable columns found in this file.");
  return { sheets, mode: detectedMode === "mixed" ? "data" : detectedMode, truncated, rowCount: totalRows };
}

export async function profileFile(file, opts = {}) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("Old-format .xls files aren't supported. Re-save as .xlsx or .csv.");
  if (!(name.endsWith(".xlsx") || name.endsWith(".csv"))) throw new Error("Profiling reads .xlsx and .csv files.");
  const buf = await file.arrayBuffer();
  return profileWorkbookBuffer(buf, opts);
}
