/**
 * Module: Public Types & Engine Version
 * Purpose: Define the canonical product contract, parse result shape, mode enums,
 * and engine version banner exposed in `meta` for diagnostics and client branching.
 * Signed: EyosiyasJ
 */
// Canonical representation used for /products/import and preview
export interface CanonicalProduct {
  product: {
    generic_name: string;
    brand_name?: string | null;
    manufacturer_name?: string | null;
    strength: string;
    form: string;
    category?: string | null;
    umbrella_category?:
      | "GASTROINTESTINAL"
      | "RESPIRATORY"
      | "CARDIOVASCULAR"
      | "ANTI_INFECTIVES"
      | "CNS"
      | "ANESTHESIA"
      | "MUSCULOSKELETAL"
      | "OPHTHALMIC"
      | "BLOOD"
      | "ENDO_CONTRACEPTIVES"
      | "VACCINES"
      | "IMMUNOMODULATORS"
      | "DERMATOLOGICAL"
      | "VITAMINS"
      | "OB_GYN"
      | "BPH"
      | "FLUID_ELECTROLYTE"
      | "ANTINEOPLASTICS_SUPPORT"
      | "ENT"
      | "SERA_IG"
      | "ANTIDOTES_POISONING"
      | "RADIOCONTRAST"
      | "MISC"
      | null;
    requires_prescription?: boolean | null;
    is_controlled?: boolean | null;
    storage_conditions?: string | null;
    description?: string | null;
  };
  batch: {
    batch_no: string;
    expiry_date: string; // ISO yyyy-MM-dd
    on_hand: number;
    unit_price?: number | null;
    coo?: string | null;
  };
  // Packaging namespace for pack contents and related data
  pkg?: {
    pieces_per_unit?: number | null;
  };
  // If you already have identity fields (cat/frm/pkg/coo/sku), add them here.
  // These are kept optional to preserve backward compatibility until backends adopt them.
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

export type SourceSchema =
  | "template_v3"    // Official MedWay Excel template
  | "concat_items"   // Items.xlsx-style concatenated fields (new name)
  | "legacy_items"   // Alias for backward compatibility
  | "csv_generic"    // Generic CSV with fuzzy mapping
  | "unknown";       // Unrecognized schema

export type AnalysisMode = "fast" | "deep";
export type ValidationMode = "full" | "errorsOnly" | "none";

export interface ParseOptions {
  mode?: AnalysisMode;
  validationMode?: ValidationMode;
}

export interface ParsedRowError {
  row: number;    // Excel/CSV row index (1-based; include header row in your convention)
  field: string;  // Canonical field path, e.g. "product.generic_name", "batch.expiry_date"
  code: string;   // e.g. "missing_required", "invalid_format", "invalid_value", "expired"
  message: string;
}

export interface ParsedImportResult {
  rows: CanonicalProduct[]; // Valid, sanitized rows ready for preview/import
  errors: ParsedRowError[]; // All row-level and file-level errors
  meta: {
    sourceSchema: SourceSchema;
    headerMode?: "headers" | "none" | "untrusted";
    fallbackUsed?: boolean;
    columnGuesses?: Array<{
      index: number;
      candidates: Array<{ field: string; confidence: number }>;
      sampleValues: string[];
    }>;
    concatenatedColumns?: Array<{ index: number; reason: string }>;
    dirtyColumns?: Array<{ index: number; header: string }>;
    decomposedColumns?: Array<{ index: number; header: string }>;
    // Self-describing contract: required fields the frontend should treat as blocking if missing
    requiredFields?: string[];
    templateVersion?: string;   // From __meta sheet, if present
    headerChecksum?: string;    // From __meta, if present
    totalRows: number;          // Raw rows found (excluding header)
    parsedRows: number;         // Rows that survived sanitize
    analysisMode?: AnalysisMode;
    sampleSize?: number;
    concatMode?: "none" | "name_only" | "full";
    validationMode?: ValidationMode;
    engineVersion?: string;
  };
}

export const ENGINE_VERSION = "0.1.0";

export type ParseResult = ParsedImportResult;
