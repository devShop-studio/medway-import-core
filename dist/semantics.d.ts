/**
 * Module: Header Semantics & Mapping
 * Purpose: Provide synonyms, type compatibility, and scoring to map raw headers
 * to canonical keys with confidence for generic CSVs and headerless detection.
 * Signed: EyosiyasJ
 */
export type CanonicalKey = "generic_name" | "brand_name" | "strength" | "form" | "category" | "expiry_date" | "batch_no" | "pack_contents" | "on_hand" | "unit_price" | "coo" | "sku" | "manufacturer" | "notes" | "requires_prescription" | "is_controlled" | "storage_conditions" | "purchase_unit" | "pieces_per_unit" | "unit" | "reserved" | "product_type";
export interface HeaderMappingHint {
    header: string;
    key?: CanonicalKey;
    confidence: number;
}
/**
 * Suggest canonical mappings for headers with confidence scores.
 *
 * Parameters:
 * - `headers`: raw header labels from the file.
 * - `sampleRows`: small sample of row objects to evaluate type compatibility.
 *
 * Returns: `HeaderMappingHint[]` with `{ header, key?, confidence }` used by detection
 * and debugging in CLI/UI. Confidence combines token overlap and value-type checks.
 * Signed: EyosiyasJ
 */
export declare function suggestHeaderMappings(headers: string[], sampleRows: Array<Record<string, unknown>>): HeaderMappingHint[];
//# sourceMappingURL=semantics.d.ts.map