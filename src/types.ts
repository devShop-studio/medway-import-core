// Canonical representation used for /products/import and preview
export interface CanonicalProduct {
  product: {
    generic_name: string;
    brand_name?: string | null;
    strength: string;
    form: string;
    category?: string | null;
  };
  batch: {
    batch_no: string;
    expiry_date: string; // ISO yyyy-MM-dd
    on_hand: number;
    unit_price?: number | null;
    coo?: string | null;
  };
  // If you already have identity fields (cat/frm/pkg/coo/sku), add them here.
  // These are kept optional to preserve backward compatibility until backends adopt them.
  identity?: {
    cat?: string | null;
    frm?: string | null;
    pkg?: string | null;
    coo?: string | null;
    sku?: string | null;
  };
}

export type SourceSchema =
  | "template_v3"    // Official MedWay Excel template
  | "legacy_items"   // Items.xlsx-style legacy exports
  | "csv_generic"    // Generic CSV with fuzzy mapping
  | "unknown";       // Unrecognized schema

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
    templateVersion?: string;   // From __meta sheet, if present
    headerChecksum?: string;    // From __meta, if present
    totalRows: number;          // Raw rows found (excluding header)
    parsedRows: number;         // Rows that survived sanitize
  };
}
