import { RawRow } from "./csv.js";
import { ParsedImportResult } from "./types.js";
import type { ParseOptions } from "./types.js";
interface ParseProductsCoreInput {
    rows: RawRow[];
    filename: string;
    headerMeta?: {
        templateVersion?: string;
        headerChecksum?: string;
    };
    options?: ParseOptions;
}
/**
 * Module: Core Parsing Pipeline
 * Purpose: Convert loosely-typed raw rows to canonical product+batch structure with
 * opportunistic text decomposition and schema-aware validation.
 * Design:
 * - Analysis mode (`fast|deep`) tunes sampling for detection (headers, concat columns);
 *   per-row splitting/decomposition/validation remain identical across modes.
 * - Column hygiene classifier prevents heavy decomposition on clean numeric/ID columns.
 * - Concat modes: `none` | `name_only` | `full` determine where decomposition is applied.
 * Meta:
 * - Emits `analysisMode`, `sampleSize`, `concatMode`, `dirtyColumns`, `decomposedColumns`, `engineVersion`.
 * Signed: EyosiyasJ
 */
/**
 * Parse raw rows into canonical products, applying:
 * - Pre-sanitize concatenation overlay for flagged columns
 * - Row-level opportunistic decomposition on textual fields
 * Opportunistic tuning: use `minSignals: 2` for `product.generic_name` (Name column)
 * to better split embedded strength/form/pack without harming formulas.
 * Signed: EyosiyasJ
 */
/**
 * Parse core with analysis mode affecting sampling for detection only.
 * Per-row splitting/decomposition/validation remains identical.
 * Signed: EyosiyasJ
 */
export declare function parseProductsCore(input: ParseProductsCoreInput): ParsedImportResult;
export {};
//# sourceMappingURL=parseProductsCore.d.ts.map