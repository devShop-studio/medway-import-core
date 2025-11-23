import type { CanonicalProduct, ParsedRowError, SourceSchema } from "./types.js";
/**
 * Module: Field Sanitizers & Row Validation
 * Purpose: Normalize and validate loosely-typed product fields into canonical shapes.
 * Features:
 * - Fuzzy form normalization with autocorrect and hygiene warnings (no digits rule).
 * - Strength normalization supporting ratios and percent formats.
 * - Flexible GTIN, batch, number, and date parsers with bounds and warnings.
 * - Schema-aware row validation (best-effort for `concat_items` when no dose signal).
 * - Validation modes: `full`, `errorsOnly`, `none`.
 * Signed: EyosiyasJ
 */
export type IssueLevel = "error" | "warn";
export type Issue = {
    field: string;
    code: string;
    msg: string;
    level: IssueLevel;
};
export interface CanonicalRowInput {
    generic_name?: unknown;
    strength?: unknown;
    form?: unknown;
    brand_name?: unknown;
    manufacturer_name?: unknown;
    gtin?: unknown;
    category?: unknown;
    requires_prescription?: unknown;
    is_controlled?: unknown;
    storage_conditions?: unknown;
    description?: unknown;
    batch_no?: unknown;
    expiry_date?: unknown;
    on_hand?: unknown;
    unit_price?: unknown;
    reserved?: unknown;
    purchase_unit?: unknown;
    pieces_per_unit?: unknown;
    unit?: unknown;
    cat?: unknown;
    frm?: unknown;
    pkg?: unknown;
    coo?: unknown;
    sku?: unknown;
}
export interface SanitizedRow {
    generic_name: string;
    strength?: string;
    form?: FormEnum;
    brand_name?: string;
    manufacturer_name?: string;
    gtin?: string;
    category?: string;
    requires_prescription?: boolean;
    is_controlled?: boolean;
    storage_conditions?: string;
    description?: string;
    batch_no?: string;
    expiry_date?: string;
    on_hand?: number;
    unit_price?: number;
    reserved?: number;
    purchase_unit?: string;
    pieces_per_unit?: string;
    unit?: string;
    cat?: string;
    frm?: string;
    pkg?: string;
    coo?: string;
    sku?: string;
}
declare const FORM_ENUM: readonly ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "inhaler", "suspension", "solution", "gel", "spray", "lotion", "patch", "powder", "other"];
type FormEnum = (typeof FORM_ENUM)[number];
/**
 * Normalize free-text dosage form to canonical enum with fuzzy match and hygiene checks.
 * Enforces no-digits rule (warn) and autocorrects close variants; errors on unknowns.
 * Signed: EyosiyasJ
 */
export declare function sanitizeForm(v: unknown): {
    value?: FormEnum;
    issues: Issue[];
    suggestion?: FormEnum;
};
export declare function sanitizeStrength(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeGTIN(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeBool(v: unknown): {
    value?: boolean;
    issues: Issue[];
};
export declare function sanitizeBatchNo(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeExpiry(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeNumber(v: unknown, { gt, ge }?: {
    gt?: number;
    ge?: number;
}): {
    value?: number;
    issues: Issue[];
};
export declare function sanitizeGenericName(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeCategoryCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeFormCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizeCountryCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
export declare function sanitizePackageCode(v: unknown): {
    value?: string;
    issues: Issue[];
};
/**
 * Sanitize a loosely-typed canonical row with schema-aware invariants.
 * Signed: EyosiyasJ
 */
export declare function sanitizeRow(input: CanonicalRowInput, schema?: SourceSchema): {
    row: SanitizedRow;
    issues: Issue[];
};
/**
 * Sanitize and validate a canonical row with schema-aware rules and mode controls.
 *
 * Parameters:
 * - `raw`: partial `CanonicalProduct` prior to strict normalization.
 * - `rowIndex`: 1-based Excel/CSV row index for error reporting.
 * - `schema`: `SourceSchema` used to adjust requiredness (best-effort for `concat_items`).
 * - `validationMode`: `full` | `errorsOnly` | `none` to control error verbosity/perf.
 *
 * Behavior:
 * - Builds `pkg.pieces_per_unit` from `pieces_per_unit` and retains `identity` codes.
 * - For `concat_items` with no dose signal (no strength), only `generic_name` is required.
 * - Suppresses category digit/units warnings under `concat_items` (POS IDs common).
 * - Filters warnings in `errorsOnly`; suppresses all errors in `none`.
 *
 * Returns:
 * - `{ row, errors }` where `row` is `CanonicalProduct | null` if unrecoverable,
 *   and `errors` are `ParsedRowError[]` respecting `validationMode`.
 * Signed: EyosiyasJ
 */
export declare function sanitizeCanonicalRow(raw: Partial<CanonicalProduct>, rowIndex: number, schema?: SourceSchema, validationMode?: "full" | "errorsOnly" | "none"): {
    row: CanonicalProduct | null;
    errors: ParsedRowError[];
};
export {};
//# sourceMappingURL=sanitize.d.ts.map