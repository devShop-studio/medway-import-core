import 'xlsx/dist/cpexcel.js';
import { parseProductsCore } from "./parseProductsCore.js";
export { suggestHeaderMappings } from "./semantics.js";
import type { ParsedImportResult } from "./types.js";
import type { ParseOptions } from "./types.js";
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
export declare function parseProductsFileFromBuffer(fileBytes: ArrayBuffer, filename: string, options?: ParseOptions): Promise<ParsedImportResult>;
//# sourceMappingURL=index.d.ts.map