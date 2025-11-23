import 'xlsx/dist/cpexcel.js';
import { parseProductsCore } from "./parseProductsCore.js";
import { detectHeaderMode, buildRawRows } from "./csv.js";
import { detectDelimiterFromText, parseDsvRaw } from "./csv.js";
import { inferHeaderlessGuesses } from "./schema.js";
import { readTabularAoA } from "./xlsx.js";
export { suggestHeaderMappings } from "./semantics.js";
export * from "./types.js";
export * from "./sanitize.js";
export { parseProductsCore };
/**
 * Module: Import Core Entry Point
 * Purpose: Provide a browser/RN-safe API to parse CSV/XLSX product files into
 * canonical MedWay rows with validation errors and rich meta for UI/diagnostics.
 * Notes:
 * - Accepts `ArrayBuffer` to support Web and React Native.
 * - Auto-detects headers vs headerless mode and POS-style concatenation.
 * - Analysis mode affects sampling for detection only; per-row logic is identical.
 * Signed: EyosiyasJ
 */
/**
 * Parse a products file (XLSX or CSV) from bytes and produce canonical rows with errors and meta.
 * Accepts ArrayBuffer input to work in web and React Native environments.
 *
 * Parameters:
 * - `fileBytes`: `ArrayBuffer` of the uploaded file.
 * - `filename`: original filename (used to detect `.xlsx` vs `.csv`).
 * - `options`: optional `{ mode?: "fast"|"deep", validationMode?: "full"|"errorsOnly"|"none" }`.
 *
 * Returns: `ParsedImportResult`
 * - `rows`: sanitized canonical products ready for preview/import.
 * - `errors`: blocking and warning validation messages (filtered by `validationMode`).
 * - `meta`: detection and processing metadata (schema, headerMode, requiredFields, analysisMode, sampleSize,
 *           concatMode, columnGuesses for headerless, concatenatedColumns, dirty/decomposed columns, engineVersion).
 *
 * Behavior:
 * - `.xlsx`: parsed via `readXlsxToRows` and fed to `parseProductsCore`.
 * - `.csv`: raw rows parsed and evaluated for header vs headerless; both paths are attempted and the better result chosen.
 * - `requiredFields` in meta aligns UI contracts and is schema-aware for POS (`concat_items`).
 * Signed: EyosiyasJ
 */
/**
 * parseProductsFileFromBuffer
 * Accepts `ArrayBuffer` and filename; parses any tabular format using a universal strategy:
 * - First attempt SheetJS workbook reader (handles XLS/XLSX/XLSB/ODS/HTML/CSV/TSV)
 * - If workbook parse yields rows, perform header detection and map via `buildRawRows`
 * - Fallback: sniff delimiter and parse DSV text for generic CSV/TSV
 * Signed: EyosiyasJ
 */
export async function parseProductsFileFromBuffer(fileBytes, filename, options) {
    const lower = filename.toLowerCase();
    // Try universal workbook/tabular reader first
    try {
        const { rows: aoa, headerMeta } = await readTabularAoA(fileBytes);
        if (aoa && aoa.length) {
            const headerMode = detectHeaderMode(aoa);
            const rows = buildRawRows(aoa, headerMode === "none" ? "none" : "headers");
            const res = parseProductsCore({ rows, headerMeta, filename, options, origin: "workbook" });
            res.meta.headerMode = headerMode;
            if (res.meta.headerMode === "none") {
                const rawNone = buildRawRows(aoa, "none");
                const { guesses } = inferHeaderlessGuesses(rawNone);
                res.meta.columnGuesses = guesses.map((g) => ({
                    index: g.index,
                    candidates: g.candidates.map((c) => ({ field: mapCanonToPath(c.canon), confidence: c.score })),
                    sampleValues: g.sample,
                }));
            }
            return res;
        }
    }
    catch (e) {
        // continue to text fallback
    }
    // Text fallback for generic delimited files
    const text = new TextDecoder("utf-8").decode(fileBytes);
    const delim = detectDelimiterFromText(text);
    const raw = parseDsvRaw(text, delim);
    const headerMode = detectHeaderMode(raw);
    const rowsHeaders = buildRawRows(raw, "headers");
    const rowsNone = buildRawRows(raw, "none");
    const resHeaders = parseProductsCore({ rows: rowsHeaders, filename, options, origin: "text" });
    const resNone = parseProductsCore({ rows: rowsNone, filename, options, origin: "text" });
    const pickNone = headerMode === "none" || (resHeaders.meta.parsedRows === 0 && resNone.meta.parsedRows > resHeaders.meta.parsedRows);
    const result = pickNone ? resNone : resHeaders;
    result.meta.headerMode = pickNone ? "none" : headerMode;
    if (result.meta.headerMode === "none") {
        const { guesses } = inferHeaderlessGuesses(rowsNone);
        result.meta.columnGuesses = guesses.map((g) => ({
            index: g.index,
            candidates: g.candidates.map((c) => ({ field: mapCanonToPath(c.canon), confidence: c.score })),
            sampleValues: g.sample,
        }));
    }
    // Expose required fields contract in meta so frontends can align behavior
    // Schema-aware: for POS-style concat imports, use best-effort (generic_name only)
    result.meta.requiredFields =
        result.meta.sourceSchema === "concat_items"
            ? ["product.generic_name"]
            : [
                "product.generic_name",
                "product.strength",
                "product.form",
                "product.category",
                "batch.expiry_date",
                "pkg.pieces_per_unit",
                "identity.coo",
                "batch.on_hand",
            ];
    return result;
}
/**
 * Map canonical flat keys to nested field paths used in meta and UI.
 * Includes packaging mapping to `pkg.pieces_per_unit`.
 * Signed: EyosiyasJ
 */
function mapCanonToPath(k) {
    switch (k) {
        case "generic_name": return "product.generic_name";
        case "brand_name": return "product.brand_name";
        case "manufacturer_name": return "product.manufacturer_name";
        case "strength": return "product.strength";
        case "form": return "product.form";
        case "category": return "product.category";
        case "requires_prescription": return "product.requires_prescription";
        case "expiry_date": return "batch.expiry_date";
        case "batch_no": return "batch.batch_no";
        case "on_hand": return "batch.on_hand";
        case "unit_price": return "batch.unit_price";
        case "coo": return "identity.coo";
        case "sku": return "identity.sku";
        case "cat": return "identity.cat";
        case "frm": return "identity.frm";
        case "pkg": return "identity.pkg";
        case "purchase_unit": return "identity.purchase_unit";
        case "pieces_per_unit": return "pkg.pieces_per_unit";
        case "unit": return "identity.unit";
        case "product_type": return "identity.product_type";
        default: return String(k);
    }
}
