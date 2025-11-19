export type CanonicalKey = "generic_name" | "brand_name" | "strength" | "form" | "category" | "expiry_date" | "batch_no" | "pack_contents" | "on_hand" | "unit_price" | "coo" | "sku" | "manufacturer" | "notes";
export interface HeaderMappingHint {
    header: string;
    key?: CanonicalKey;
    confidence: number;
}
/**
 * Suggest canonical mappings for headers with confidence scores
 */
export declare function suggestHeaderMappings(headers: string[], sampleRows: Array<Record<string, unknown>>): HeaderMappingHint[];
//# sourceMappingURL=semantics.d.ts.map