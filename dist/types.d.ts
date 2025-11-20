/**
 * Module: Public Types & Engine Version
 * Purpose: Define the canonical product contract, parse result shape, mode enums,
 * and engine version banner exposed in `meta` for diagnostics and client branching.
 * Signed: EyosiyasJ
 */
export interface CanonicalProduct {
    product: {
        generic_name: string;
        brand_name?: string | null;
        manufacturer_name?: string | null;
        strength: string;
        form: string;
        category?: string | null;
        umbrella_category?: "GASTROINTESTINAL" | "RESPIRATORY" | "CARDIOVASCULAR" | "ANTI_INFECTIVES" | "CNS" | "ANESTHESIA" | "MUSCULOSKELETAL" | "OPHTHALMIC" | "BLOOD" | "ENDO_CONTRACEPTIVES" | "VACCINES" | "IMMUNOMODULATORS" | "DERMATOLOGICAL" | "VITAMINS" | "OB_GYN" | "BPH" | "FLUID_ELECTROLYTE" | "ANTINEOPLASTICS_SUPPORT" | "ENT" | "SERA_IG" | "ANTIDOTES_POISONING" | "RADIOCONTRAST" | "MISC" | null;
        requires_prescription?: boolean | null;
        is_controlled?: boolean | null;
        storage_conditions?: string | null;
        description?: string | null;
    };
    batch: {
        batch_no: string;
        expiry_date: string;
        on_hand: number;
        unit_price?: number | null;
        coo?: string | null;
    };
    pkg?: {
        pieces_per_unit?: number | null;
    };
    identity?: {
        cat?: string | null;
        frm?: string | null;
        pkg?: string | null;
        coo?: string | null;
        sku?: string | null;
        purchase_unit?: string | null;
        unit?: string | null;
    };
}
export type SourceSchema = "template_v3" | "concat_items" | "legacy_items" | "csv_generic" | "unknown";
export type AnalysisMode = "fast" | "deep";
export type ValidationMode = "full" | "errorsOnly" | "none";
export interface ParseOptions {
    mode?: AnalysisMode;
    validationMode?: ValidationMode;
}
export interface ParsedRowError {
    row: number;
    field: string;
    code: string;
    message: string;
}
export interface ParsedImportResult {
    rows: CanonicalProduct[];
    errors: ParsedRowError[];
    meta: {
        sourceSchema: SourceSchema;
        headerMode?: "headers" | "none" | "untrusted";
        fallbackUsed?: boolean;
        columnGuesses?: Array<{
            index: number;
            candidates: Array<{
                field: string;
                confidence: number;
            }>;
            sampleValues: string[];
        }>;
        concatenatedColumns?: Array<{
            index: number;
            reason: string;
        }>;
        dirtyColumns?: Array<{
            index: number;
            header: string;
        }>;
        decomposedColumns?: Array<{
            index: number;
            header: string;
        }>;
        requiredFields?: string[];
        templateVersion?: string;
        headerChecksum?: string;
        totalRows: number;
        parsedRows: number;
        analysisMode?: AnalysisMode;
        sampleSize?: number;
        concatMode?: "none" | "name_only" | "full";
        validationMode?: ValidationMode;
        engineVersion?: string;
    };
}
export declare const ENGINE_VERSION = "0.1.0";
export type ParseResult = ParsedImportResult;
//# sourceMappingURL=types.d.ts.map