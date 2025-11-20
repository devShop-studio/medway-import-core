import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseProductsFileFromBuffer, suggestHeaderMappings } from "../dist/index.js";
import { detectSourceSchema, mapRawRowToCanonical } from "../dist/schema.js";
import { sanitizeCanonicalRow } from "../dist/sanitize.js";
import { parseCsvToRows } from "../dist/csv.js";
import { readXlsxToRows } from "../dist/xlsx.js";

/**
 * Convert Node Buffer to ArrayBuffer for API compatibility
 */
function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Format and print a concise summary of parse results
 */
function printSummary(result) {
  const { meta, errors, rows } = result;
  console.log("schema:", meta.sourceSchema);
  console.log("templateVersion:", meta.templateVersion ?? "-");
  console.log("headerChecksum:", meta.headerChecksum ?? "-");
  console.log("totalRows:", meta.totalRows, "parsedRows:", meta.parsedRows);
  const sample = rows.slice(0, 3);
  console.log("sampleRows:", JSON.stringify(sample, null, 2));
  if (errors.length) {
    const MAX_PRINT = 200;
    console.log(`errors (showing first ${Math.min(MAX_PRINT, errors.length)} of ${errors.length}):`);
    for (let i = 0; i < Math.min(MAX_PRINT, errors.length); i++) {
      const e = errors[i];
      console.log(`Row ${e.row}: ${e.field} – ${e.code} – ${e.message}`);
    }
  } else {
    console.log("errors: none");
  }
}

/**
 * Main: parse a file path and print results
 */
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 1) {
    console.error("Usage: node scripts/parse-file.mjs <filePath>");
    process.exit(1);
  }
  const filePath = path.resolve(argv[0]);
  const filename = path.basename(filePath);
  const bytes = toArrayBuffer(await fs.promises.readFile(filePath));
  let mode = "fast";
  if (argv.includes("--deep")) mode = "deep";
  const modeFlag = argv.find((a) => a.startsWith("--mode="));
  if (modeFlag) mode = modeFlag.split("=")[1];
  let validationMode = "full";
  const valFlag = argv.find((a) => a.startsWith("--validation="));
  if (valFlag) {
    const v = valFlag.split("=")[1];
    if (v === "full" || v === "errorsOnly") validationMode = v;
  }

  // Derive header mapping hints
  let rawRows = [];
  if (filename.toLowerCase().endsWith(".xlsx")) {
    const { rows } = await readXlsxToRows(bytes);
    rawRows = rows || [];
  } else {
    const text = new TextDecoder("utf-8").decode(bytes);
    rawRows = parseCsvToRows(text);
  }
  const headers = Object.keys(rawRows[0] || {});
  const sampleRows = rawRows.slice(0, 20);
  const hints = headers.length ? suggestHeaderMappings(headers, sampleRows) : [];

  const result = await parseProductsFileFromBuffer(bytes, filename, { mode, validationMode });
  printSummary(result);
  console.log(`headerMode: ${result.meta.headerMode ?? '-'}`);
  console.log(`analysisMode: ${result.meta.analysisMode ?? '-'}`);
  console.log(`sampleSize: ${result.meta.sampleSize ?? '-'}`);
  console.log(`concatMode: ${result.meta.concatMode ?? '-'}`);
  console.log(`validationMode: ${result.meta.validationMode ?? '-'}`);
  if (Array.isArray(result.meta.dirtyColumns)) {
    const names = result.meta.dirtyColumns.map(d=>d.header).join(', ');
    console.log(`dirtyColumns: ${names || '-'}`);
  }
  if (Array.isArray(result.meta.decomposedColumns)) {
    const names = result.meta.decomposedColumns.map(d=>d.header).join(', ');
    console.log(`decomposedColumns: ${names || '-'}`);
  }
  if ((result.meta.headerMode ?? '-') !== 'none' && hints.length) {
    console.log("headerMappings:");
    for (const h of hints) {
      console.log(`  '${h.header}' => ${h.key ?? "unknown"} (confidence=${h.confidence.toFixed(2)})`);
    }
  }
  if (Array.isArray(result.meta.columnGuesses) && result.meta.columnGuesses.length) {
    console.log("columnGuesses:");
    for (const g of result.meta.columnGuesses) {
      const top = g.candidates.slice(0, 3).map((c) => `${c.field}(${c.confidence.toFixed(2)})`).join(", ");
      console.log(`  col_${g.index + 1}: ${top}`);
      if (g.sampleValues?.length) {
        console.log(`    samples: ${g.sampleValues.slice(0, 5).map((s)=>String(s)).join(" | ")}`);
      }
    }
  }
  const nameMissingRows = Array.from(new Set(result.errors.filter(e => e.code === "E_PRODUCT_NAME_REQUIRED").map(e => e.row))).sort((a,b)=>a-b);
  if (nameMissingRows.length) {
    console.log(`rowsMissingProductName: ${JSON.stringify(nameMissingRows)}`);
  }

  // Debug: recompute per-row to list which indices were kept/dropped
  const schema = detectSourceSchema(rawRows, undefined);
  const kept = [];
  const dropped = [];
  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapRawRowToCanonical(rawRows[i], i + 2, schema);
    if (!mapped) { dropped.push(i + 2); continue; }
    const { row } = sanitizeCanonicalRow(mapped, i + 2, schema);
    if (row) kept.push(i + 2); else dropped.push(i + 2);
  }
  console.log(`debug.keptIndices: ${JSON.stringify(kept.slice(0, 60))}`);
  console.log(`debug.droppedIndices: ${JSON.stringify(dropped.slice(0, 60))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});