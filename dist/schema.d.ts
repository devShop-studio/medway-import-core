import { RawRow } from "./csv.js";
import { CanonicalProduct, SourceSchema } from "./types.js";
type CanonicalFlat = {
    generic_name?: string;
    brand_name?: string | null;
    manufacturer_name?: string | null;
    strength?: string;
    form?: string;
    category?: string | null;
    batch_no?: string;
    expiry_date?: string;
    on_hand?: number;
    unit_price?: number;
    coo?: string | null;
    cat?: string | null;
    frm?: string | null;
    pkg?: string | null;
    sku?: string | null;
    requires_prescription?: string | boolean | null;
    is_controlled?: string | boolean | null;
    storage_conditions?: string | null;
    description?: string | null;
    purchase_unit?: string | null;
    pieces_per_unit?: number | string | null;
    unit?: string | null;
    product_type?: string | null;
};
/**
 * Detect input schema from headers and optional template metadata.
 * Returns one of:
 * - `template_v3`: official MedWay Excel template (checksum or exact headers)
 * - `concat_items`: Items.xlsx style with concatenated fields (alias: legacy_items)
 * - `csv_generic`: generic CSV with fuzzy header mapping
 * - `unknown`: unrecognized shape
 * Signed: EyosiyasJ
 */
export declare function detectSourceSchema(rows: RawRow[], headerMeta?: {
    templateVersion?: string;
    headerChecksum?: string;
}, origin?: "workbook" | "text"): SourceSchema;
/**
 * Map a single raw row to a partial `CanonicalProduct` based on detected schema.
 * Supports headerless assignments for CSV when provided.
 * Drops fully empty rows.
 * Signed: EyosiyasJ
 */
export declare function mapRawRowToCanonical(raw: RawRow, excelRowIndex: number, schema: SourceSchema, headerlessAssign?: Record<string, keyof CanonicalFlat>): Partial<CanonicalProduct> | null;
/**
 * Infer headerless column assignments to canonical fields using value-shape heuristics.
 * Includes packaging: classify small integer columns as `pieces_per_unit`.
 * Signed: EyosiyasJ
 */
export declare function inferHeaderlessAssignments(rows: RawRow[]): Record<string, keyof CanonicalFlat>;
/**
 * Produce column guesses with candidates and confidence for headerless files.
 * Includes packaging guess for `pieces_per_unit`.
 * Signed: EyosiyasJ
 */
export declare function inferHeaderlessGuesses(rows: RawRow[]): {
    assignment: Record<string, keyof CanonicalFlat>;
    guesses: Array<{
        key: string;
        index: number;
        candidates: Array<{
            canon: keyof CanonicalFlat;
            score: number;
        }>;
        sample: string[];
    }>;
};
/**
 * Column-level concatenation detector using content signals rather than headers.
 * Criteria: sample values with ≥2 signals among strength/form/pack/country/GTIN/batch should be present in ≥70% rows,
 * and formula-like patterns must not dominate.
 * Skips obviously atomic columns.
 * Signed: EyosiyasJ
 */
/**
 * Identify columns likely to contain concatenated product text for pre-sanitize decomposition.
 * Flags a column when ≥70% of sampled non-empty cells have ≥2 signals among
 * {strength, form, pack, country, batch, GTIN} with formula-rate ≤30%.
 * Signed: EyosiyasJ
 */
export declare function inferConcatenatedColumns(rows: RawRow[]): Array<{
    index: number;
    reason: string;
}>;
export {};
//# sourceMappingURL=schema.d.ts.map