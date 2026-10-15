import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { callClaudeWithImage } from "./ai";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Safety net for genuinely huge documents: truncate rather than silently
// blow past what's useful in a single AI prompt. Real chunking/summarization
// for multi-file discovery packets is backlog, not this pass.
const MAX_CHARS = 40000;

function truncateWithWarning(text) {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_CHARS) + "\n\n[...truncated — document exceeded the safe length for a single extraction. Consider splitting it and uploading the most relevant section.]",
    truncated: true,
  };
}

async function extractPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  if (!text.trim()) {
    throw new Error("No selectable text found in this PDF — it may be a scanned image rather than real text, which this doesn't read yet.");
  }
  return text;
}

async function extractDocx(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

async function extractXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  let text = "";
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    if (rows.trim()) text += `## Sheet: ${sheetName}\n${rows}\n\n`;
  }
  if (!text.trim()) throw new Error("No readable data found in this spreadsheet.");
  return text;
}

async function extractImage(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",")[1];
  const mediaType = file.type || "image/png";
  return callClaudeWithImage(
    "Transcribe all readable text in this image exactly. If it's a diagram, whiteboard, or architecture sketch rather than plain text, describe its structure and content in plain language instead, in enough detail to be useful as software implementation discovery notes.",
    base64,
    mediaType
  );
}

// Returns { text, truncated, sourceType }
export async function extractFile(file) {
  const name = file.name.toLowerCase();
  let text;
  let sourceType;

  if (name.endsWith(".pdf")) {
    text = await extractPdf(file);
    sourceType = "pdf";
  } else if (name.endsWith(".docx")) {
    text = await extractDocx(file);
    sourceType = "docx";
  } else if (name.endsWith(".xlsx")) {
    text = await extractXlsx(file);
    sourceType = "xlsx";
  } else if (name.endsWith(".xls")) {
    throw new Error("Old-format .xls files aren't supported — only .xlsx. Try re-saving it as .xlsx first.");
  } else if (name.endsWith(".doc")) {
    throw new Error("Old-format .doc files aren't supported — only .docx. Try re-saving it as .docx first.");
  } else if (file.type.startsWith("image/")) {
    text = await extractImage(file);
    sourceType = "image";
  } else {
    throw new Error("Unsupported file type. This reads PDF, DOCX, XLSX, and images (PNG/JPG) for now.");
  }

  const { text: finalText, truncated } = truncateWithWarning(text.trim());
  return { text: finalText, truncated, sourceType };
}
