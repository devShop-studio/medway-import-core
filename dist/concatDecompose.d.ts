/**
 * Module: Concatenated Text Decomposition
 * Purpose: Extract canonical fields (strength, form, pack contents, COO, GTIN, batch, manufacturer)
 * from mixed text cells and provide a cleaned leftover for textual targets.
 * Modes:
 * - `default`: balanced extraction for flagged concat columns.
 * - `opportunistic`: stricter acceptance for mixed columns; requires multiple signals.
 * Anchors:
 * - Formal form identifier (dictionary) improves tail-phrase detection.
 * - Name splitter provides fallback for common `Name` patterns.
 * Signed: EyosiyasJ
 */
/**
 * Canonical field paths we might extract from a concatenated cell.
 * Signed: EyosiyasJ
 */
export type CanonicalFieldPath = "product.generic_name" | "product.brand_name" | "product.strength" | "product.form" | "product.category" | "product.manufacturer_name" | "product.description" | "product.umbrella_category" | "batch.batch_no" | "batch.expiry_date" | "batch.on_hand" | "batch.unit_price" | "identity.coo" | "identity.sku" | "identity.purchase_unit" | "pkg.pieces_per_unit";
export interface ConcatExtraction {
    field: CanonicalFieldPath;
    value: string | number;
    confidence: number;
    reason: string;
}
export interface ConcatDecomposition {
    leftover: string;
    extractions: ConcatExtraction[];
}
/**
 * Decompose a concatenated cell into canonical extractions using reusable detectors.
 * Supports `mode: opportunistic` for stricter acceptance on mixed columns.
 * Signed: EyosiyasJ
 */
export declare function decomposeConcatenatedCell(raw: string, opts?: {
    mode?: "default" | "opportunistic";
    minSignals?: number;
}): ConcatDecomposition;
/**
 * Split a Name-like cell into {generic_name, strength, form} using right-sided patterns.
 * - Detect trailing form via synonyms (hyphen or space-suffix)
 * - Find the last strength block containing numbers + units (incl. ratios, % w/w)
 * - Preserve formulas/text in generic_name when strength not present
 * Signed: EyosiyasJ
 */
export declare function splitNameGenericStrengthForm(raw: string): {
    generic_name?: string;
    strength?: string;
    form?: string;
    leftover?: string;
};
//# sourceMappingURL=concatDecompose.d.ts.map