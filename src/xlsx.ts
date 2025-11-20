import * as XLSX from "xlsx";
import type { RawRow } from "./csv.js";

/**
 * Read an Excel workbook from `ArrayBuffer` and return normalized rows plus optional header metadata.
 * - Chooses the main sheet (prefers `Products`) and converts to `RawRow[]`.
 * - Extracts `__meta` sheet keys: `template_version`, `header_checksum` when present.
 * Signed: EyosiyasJ
 */
export async function readXlsxToRows(
  fileBytes: ArrayBuffer
): Promise<{
  rows: RawRow[];
  headerMeta?: { templateVersion?: string; headerChecksum?: string };
}> {
  const data = new Uint8Array(fileBytes);
  const workbook = XLSX.read(data, { type: "array" });

  const sheetNames = workbook.SheetNames;
  const mainSheetName = chooseMainSheet(sheetNames);
  const sheet = workbook.Sheets[mainSheetName];

  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
    defval: null,
  });
  const rows: RawRow[] = json.map((row) => {
    const out: RawRow = {};
    for (const key of Object.keys(row)) {
      out[key] = row[key] as any;
    }
    return out;
  });

  const meta = extractMetaFromWorkbook(workbook);

  return { rows, headerMeta: meta };
}

/**
 * Select the primary sheet to parse. Prefers a sheet named `Products` otherwise falls back to the first sheet.
 * Signed: EyosiyasJ
 */
function chooseMainSheet(sheetNames: string[]): string {
  const preferred = sheetNames.find(
    (name) => name.toLowerCase() === "products"
  );
  return preferred ?? sheetNames[0];
}

/**
 * Extract template metadata from the `__meta` sheet.
 * Recognized keys (A1/B1, A2/B2): `template_version`, `header_checksum`.
 * Signed: EyosiyasJ
 */
function extractMetaFromWorkbook(workbook: XLSX.WorkBook): {
  templateVersion?: string;
  headerChecksum?: string;
} {
  const metaSheet = workbook.Sheets["__meta"];
  if (!metaSheet) return {};
  const readCell = (cell: string) => {
    const val = metaSheet[cell];
    return val ? String(val.v ?? "").trim() : undefined;
  };
  const kv: Record<string, string | undefined> = {};
  const key1 = readCell("A1")?.toLowerCase();
  const val1 = readCell("B1");
  if (key1 === "template_version") kv.templateVersion = val1;
  const key2 = readCell("A2")?.toLowerCase();
  const val2 = readCell("B2");
  if (key2 === "header_checksum") kv.headerChecksum = val2;
  return kv;
}
